let semesterData = {}; // Store courses grouped by semester

// Grade points scale
const gradeScale = {
    'A': { minScore: 70, points: 5.0 },
    'B': { minScore: 60, points: 4.0 },
    'C': { minScore: 50, points: 3.0 },
    'D': { minScore: 45, points: 2.0 },
    'E': { minScore: 40, points: 1.0 },
    'F': { minScore: 0, points: 0.0 }
};

function getGrade(score) {
    if (score >= 70) return 'A';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C';
    if (score >= 45) return 'D';
    if (score >= 40) return 'E';
    return 'F';
}

function getQualityPoints(grade, creditHours) {
    const points = gradeScale[grade].points;
    return (points * creditHours).toFixed(2);
}

function addCourse() {
    const courseCode = document.getElementById('courseCode').value.trim();
    const courseTitle = document.getElementById('courseTitle').value.trim();
    const semester = document.getElementById('semester').value;
    const session = document.getElementById('session').value.trim();
    const creditHours = parseInt(document.getElementById('creditHours').value);
    const score = parseInt(document.getElementById('score').value);

    if (!courseCode || !courseTitle || !semester || !session || !creditHours || isNaN(score)) {
        alert('Please fill in all fields correctly');
        return;
    }

    if (score < 0 || score > 100) {
        alert('Score must be between 0 and 100');
        return;
    }

    const grade = getGrade(score);
    const qp = getQualityPoints(grade, creditHours);

    const course = {
        id: Date.now(),
        courseCode,
        courseTitle,
        creditHours,
        score,
        grade,
        qp: parseFloat(qp),
        session
    };

    // Create key for semester-session combination
    const semesterKey = `${semester}|${session}`;

    // Initialize if doesn't exist
    if (!semesterData[semesterKey]) {
        semesterData[semesterKey] = {
            semester: semester,
            session: session,
            courses: []
        };
    }

    semesterData[semesterKey].courses.push(course);
    clearForm();
    renderTranscript();
}

function clearForm() {
    document.getElementById('courseCode').value = '';
    document.getElementById('courseTitle').value = '';
    document.getElementById('creditHours').value = '';
    document.getElementById('score').value = '';
    document.getElementById('courseCode').focus();
}

function deleteCourse(semesterKey, courseId) {
    if (semesterData[semesterKey]) {
        semesterData[semesterKey].courses = semesterData[semesterKey].courses.filter(c => c.id !== courseId);

        // Delete semester if no courses left
        if (semesterData[semesterKey].courses.length === 0) {
            delete semesterData[semesterKey];
        }
    }
    renderTranscript();
}

function getLatestCourseAttempts() {
    // Get all courses and keep only the latest attempt of each course code
    // with accumulated credit hours
    const courseMap = {};
    const creditHourMap = {}; // Track accumulated credit hours per course

    const sortedSemesters = Object.keys(semesterData).sort();

    sortedSemesters.forEach(semesterKey => {
        const semData = semesterData[semesterKey];
        semData.courses.forEach(course => {
            // Accumulate credit hours
            if (!creditHourMap[course.courseCode]) {
                creditHourMap[course.courseCode] = 0;
            }
            creditHourMap[course.courseCode] += course.creditHours;

            // Update with the latest course
            courseMap[course.courseCode] = {
                ...course,
                accumulatedCH: creditHourMap[course.courseCode]
            };
        });
    });

    return Object.values(courseMap);
}

function getAccumulatedCreditHours(courseCode) {
    let totalCH = 0;
    const sortedSemesters = Object.keys(semesterData).sort();

    sortedSemesters.forEach(semesterKey => {
        const semData = semesterData[semesterKey];
        const coursesWithCode = semData.courses.filter(c => c.courseCode === courseCode);
        coursesWithCode.forEach(course => {
            totalCH += course.creditHours;
        });
    });

    return totalCH;
}

function calculateSemesterGPA(courses) {
    if (courses.length === 0) return 0;
    const totalQP = courses.reduce((sum, c) => sum + c.qp, 0);
    const totalCH = courses.reduce((sum, c) => sum + c.creditHours, 0);
    return (totalQP / totalCH).toFixed(2);
}

function calculateCumulativeGPA() {
    // Use only the latest attempts of each course with accumulated credit hours
    const latestCourses = getLatestCourseAttempts();

    let totalQP = 0;
    let totalCH = 0;

    latestCourses.forEach(course => {
        // Calculate QP using accumulated credit hours
        const accumulatedCH = getAccumulatedCreditHours(course.courseCode);
        const gradePoints = gradeScale[course.grade].points;
        const qp = gradePoints * accumulatedCH;

        totalQP += qp;
        totalCH += accumulatedCH;
    });

    if (totalCH === 0) return 0;
    return (totalQP / totalCH).toFixed(2);
}

function isCarriedOver(courseCode, semesterKey) {
    // Check if this course appears in later semesters
    const sortedSemesters = Object.keys(semesterData).sort();
    const currentSemesterIndex = sortedSemesters.indexOf(semesterKey);

    for (let i = currentSemesterIndex + 1; i < sortedSemesters.length; i++) {
        const laterSemData = semesterData[sortedSemesters[i]];
        const foundCourse = laterSemData.courses.find(c => c.courseCode === courseCode);
        if (foundCourse) {
            return true;
        }
    }
    return false;
}

function renderTranscript() {
    const emptyState = document.getElementById('emptyState');
    const transcriptSection = document.getElementById('transcriptSection');

    const totalCourses = Object.values(semesterData).reduce((sum, sem) => sum + sem.courses.length, 0);

    if (totalCourses === 0) {
        emptyState.style.display = 'block';
        transcriptSection.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    transcriptSection.style.display = 'block';

    // Render all semester tables
    let allTablesHTML = '';
    let allStats = { totalCourses: 0, totalCH: 0, totalScore: 0 };

    // Sort semesters
    const sortedSemesters = Object.keys(semesterData).sort();

    sortedSemesters.forEach((semesterKey, index) => {
        const semData = semesterData[semesterKey];
        const semesterDisplay = semData.semester.toUpperCase();
        const courses = semData.courses;

        allTablesHTML += `
    <div class="transcript-header">${semesterDisplay} RESULTS OF ${semData.session} SESSION - LEVEL: 500L</div>

    <table>
        <thead>
            <tr>
                <th style="width: 40px;">#</th>
                <th style="width: 100px;">CourseCode</th>
                <th>CourseTitle</th>
                <th class="credit-hours">CH</th>
                <th class="score">Score</th>
                <th class="grade">Grade</th>
                <th class="qp">QP</th>
                <th style="width: 80px;">Action</th>
            </tr>
        </thead>
        <tbody>
            `;

        let semesterTotalCH = 0;
        let semesterTotalQP = 0;

        courses.forEach((course, courseIndex) => {
            const accumulatedCH = getAccumulatedCreditHours(course.courseCode);
            const gradePoints = gradeScale[course.grade].points;
            const accumulatedQP = (gradePoints * accumulatedCH).toFixed(2);

            semesterTotalCH += accumulatedCH;
            semesterTotalQP += parseFloat(accumulatedQP);
            allStats.totalCourses++;
            allStats.totalCH += accumulatedCH;
            allStats.totalScore += course.score;

            const isCarried = isCarriedOver(course.courseCode, semesterKey);
            const rowStyle = isCarried ? 'background-color: #fff3cd; opacity: 0.7;' : '';
            const carriedLabel = isCarried ? ' <span style="color: #856404; font-size: 0.85em; margin-left: 8px;">(Carried Over)</span>' : '';
            const chDisplay = accumulatedCH > course.creditHours ? `${course.creditHours}→${accumulatedCH}` : accumulatedCH;

            allTablesHTML += `
            <tr style="${rowStyle}">
                <td class="row-number">${courseIndex + 1}</td>
                <td><strong>${course.courseCode}</strong>${carriedLabel}</td>
                <td>${course.courseTitle}</td>
                <td class="credit-hours">${chDisplay}</td>
                <td class="score">${course.score}</td>
                <td class="grade">${course.grade}</td>
                <td class="qp">${accumulatedQP}</td>
                <td style="text-align: center;">
                    <button class="delete-btn" onclick="deleteCourse('${semesterKey}', ${course.id})">Delete</button>
                </td>
            </tr>
            `;
        });

        const semesterGPA = calculateSemesterGPA(courses);

        allTablesHTML += `
            <tr class="totals-row">
                <td colspan="3" style="text-align: right;">Total:</td>
                <td class="credit-hours">${semesterTotalCH}</td>
                <td></td>
                <td></td>
                <td class="qp">${semesterTotalQP.toFixed(2)}</td>
                <td></td>
            </tr>
        </tbody>
    </table>

    <div class="gpa-section">GPA: ${semesterGPA} | CGPA: ${calculateCumulativeGPA()}</div>
    `;

        if (index < sortedSemesters.length - 1) {
            allTablesHTML += '<div style="margin-top: 40px; border-top: 2px solid #ccc; padding-top: 30px;"></div>';
        }
    });

    document.getElementById('transcriptHeader').innerHTML = '';
    document.getElementById('tableContainer').innerHTML = allTablesHTML;
    document.getElementById('gpaSection').innerHTML = `<strong>Cumulative GPA: ${calculateCumulativeGPA()}</strong>`;

    // Render Stats
    renderStats(allStats);
}

function renderStats(stats) {
    const averageScore = stats.totalCourses > 0 ? (stats.totalScore / stats.totalCourses).toFixed(2) : 0;

    const statsHTML = `
    <div class="stat-card">
        <h3>Total Courses</h3>
        <div class="value">${stats.totalCourses}</div>
    </div>
    <div class="stat-card">
        <h3>Total Credit Hours</h3>
        <div class="value">${stats.totalCH}</div>
    </div>
    <div class="stat-card">
        <h3>Average Score</h3>
        <div class="value">${averageScore}</div>
    </div>
    <div class="stat-card">
        <h3>CGPA</h3>
        <div class="value">${calculateCumulativeGPA()}</div>
    </div>
    `;

    document.getElementById('statsContainer').innerHTML = statsHTML;
}

document.getElementById('courseCode').focus();