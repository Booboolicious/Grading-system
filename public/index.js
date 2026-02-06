let semesterData = {};
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

const semesterOrder = {
    'FIRST SEMESTER': 1,
    'SECOND SEMESTER': 2,
};

function getSortedSemesterKeys() {
    return Object.keys(semesterData).sort((a, b) => {
        const [semA, sessA] = a.split('|');
        const [semB, sessB] = b.split('|');
        const sessionComparison = sessA.localeCompare(sessB, undefined, { numeric: true });
        if (sessionComparison !== 0) return sessionComparison;
        const orderA = semesterOrder[semA] || 99;
        const orderB = semesterOrder[semB] || 99;
        return orderA - orderB;
    });
}

// Auth Logic
async function handleAuth() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const isLogin = document.getElementById('authTitle').innerText === 'Login';
    const endpoint = isLogin ? '/api/login' : '/api/signup';

    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            if (isLogin) {
                currentUser = data;
                localStorage.setItem('user', JSON.stringify(data));
                showApp();
                loadCourses();
            } else {
                alert('Account created! Please login.');
                toggleAuth();
            }
        } else {
            alert(data.message || 'Authentication failed');
        }
    } catch (err) {
        alert('Error connecting to server');
    }
}

function toggleAuth(e) {
    if (e) e.preventDefault();
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('authBtn');
    const toggleText = document.getElementById('authToggleText');

    if (title.innerText === 'Login') {
        title.innerText = 'Sign Up';
        btn.innerText = 'Register';
        toggleText.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuth(event)">Login</a>';
    } else {
        title.innerText = 'Login';
        btn.innerText = 'Login';
        toggleText.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuth(event)">Sign Up</a>';
    }
}

function loginWithGoogle() {
    window.location.href = '/api/auth/google/login';
}

function loginWithGithub() {
    window.location.href = '/api/auth/github/login';
}

function loginWithFacebook() {
    window.location.href = '/api/auth/facebook/login';
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        // Eye with a slash (hidden)
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
    } else {
        passwordInput.type = 'password';
        // Normal eye
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
    }
}

function showApp() {

    document.getElementById('authSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('displayUsername').innerText = currentUser.username;
}


function logout() {
    localStorage.removeItem('user');
    currentUser = null;
    location.reload();
}

// Theme Logic
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    if (!sunIcon || !moonIcon) return;

    if (theme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
}

// Initialize Theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
document.addEventListener('DOMContentLoaded', () => updateThemeIcons(savedTheme));

// Wrapper for Fetch to include User ID

async function authenticatedFetch(url, options = {}) {
    if (!currentUser) return null;
    const headers = {
        ...options.headers,
        'X-User-ID': currentUser.userId.toString()
    };
    return fetch(url, { ...options, headers });
}

async function loadCourses() {
    if (!currentUser) {
        document.getElementById('authSection').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        return;
    }
    showApp();
    try {
        const response = await authenticatedFetch('/api/courses');
        const courses = await response.json();
        semesterData = {};
        courses.forEach(course => {
            const semesterKey = `${course.semester}|${course.session}`;
            if (!semesterData[semesterKey]) {
                semesterData[semesterKey] = {
                    semester: course.semester,
                    session: course.session,
                    level: course.level || 'N/A',
                    courses: []
                };
            }
            semesterData[semesterKey].courses.push(course);
        });
        renderTranscript();
    } catch (error) {
        console.error('Error loading courses:', error);
    }
}

// Grade points scale
const gradeScale = {
    'A': { minScore: 70, points: 5 },
    'B': { minScore: 60, points: 4 },
    'C': { minScore: 50, points: 3 },
    'D': { minScore: 45, points: 2 },
    'E': { minScore: 40, points: 1 },
    'F': { minScore: 0, points: 0 }
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

async function addCourse() {
    const courseCode = document.getElementById('courseCode').value.trim();
    const courseTitle = document.getElementById('courseTitle').value.trim();
    const semester = document.getElementById('semester').value;
    const session = document.getElementById('session').value.trim();
    const level = document.getElementById('level').value.trim();
    const creditHours = parseInt(document.getElementById('creditHours').value);
    const score = parseInt(document.getElementById('score').value);

    if (!courseCode || !courseTitle || !semester || !session || !level || !creditHours || isNaN(score)) {
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
        courseTitle,
        courseCode: courseCode.toUpperCase(),
        semester,
        creditHours,
        score,
        grade,
        qp: parseFloat(qp),
        session,
        level: level.toUpperCase()
    };

    try {
        const response = await authenticatedFetch('/api/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(course),
        });

        if (response.ok) {
            clearForm();
            loadCourses();
        } else {
            alert('Failed to add course');
        }
    } catch (error) {
        console.error('Error adding course:', error);
        alert('Error connecting to server');
    }
}

function clearForm() {
    document.getElementById('courseCode').value = '';
    document.getElementById('courseTitle').value = '';
    document.getElementById('creditHours').value = '';
    document.getElementById('score').value = '';
    document.getElementById('courseCode').focus();
}

async function deleteCourse(semesterKey, courseId) {
    if (!confirm('Are you sure you want to delete this course?')) return;
    try {
        const response = await authenticatedFetch(`/api/courses/${courseId}`, {
            method: 'DELETE',
        });
        if (response.ok) {
            loadCourses();
        } else {
            alert('Failed to delete course');
        }
    } catch (error) {
        console.error('Error deleting course:', error);
    }
}

function getLatestCourseAttempts() {
    const courseMap = {};
    const creditHourMap = {};
    const sortedSemesters = getSortedSemesterKeys();

    sortedSemesters.forEach(semesterKey => {
        const semData = semesterData[semesterKey];
        semData.courses.forEach(course => {
            if (!creditHourMap[course.courseCode]) {
                creditHourMap[course.courseCode] = 0;
            }
            creditHourMap[course.courseCode] += course.creditHours;
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
    const sortedSemesters = getSortedSemesterKeys();
    sortedSemesters.forEach(semesterKey => {
        const semData = semesterData[semesterKey];
        const coursesWithCode = semData.courses.filter(c => c.courseCode === courseCode);
        coursesWithCode.forEach(course => { totalCH += course.creditHours; });
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
    const sortedSemesters = getSortedSemesterKeys();
    if (sortedSemesters.length === 0) return "0.00";
    let totalGPA = 0;
    sortedSemesters.forEach(key => {
        const semesterGPA = parseFloat(calculateSemesterGPA(semesterData[key].courses));
        totalGPA += semesterGPA;
    });
    const averageGPA = totalGPA / sortedSemesters.length;
    return averageGPA.toPrecision(3);
}

function isCarriedOver(courseCode, semesterKey) {
    const sortedSemesters = getSortedSemesterKeys();
    const currentSemesterIndex = sortedSemesters.indexOf(semesterKey);
    for (let i = 0; i < currentSemesterIndex; i++) {
        const earlierSemData = semesterData[sortedSemesters[i]];
        const foundCourse = earlierSemData.courses.find(c => c.courseCode === courseCode);
        if (foundCourse) return true;
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

    let allTablesHTML = '';
    let allStats = { totalCourses: 0, totalCH: 0, totalScore: 0 };
    const sortedSemesters = getSortedSemesterKeys();

    sortedSemesters.forEach((semesterKey, index) => {
        const semData = semesterData[semesterKey];
        const semesterDisplay = semData.semester.toUpperCase();
        const courses = [...semData.courses].sort((a, b) =>
            a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true, sensitivity: 'base' })
        );

        allTablesHTML += `
            <div class="transcript-header">${semesterDisplay} RESULTS OF ${semData.session} SESSION - LEVEL: ${semData.level}</div>
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
                        <th style="width: 80px;" class="no-print">Action</th>
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
                    <td style="text-align: center;" class="no-print">
                        <button class="delete-btn" onclick="deleteCourse('${semesterKey}', ${course.id})" title="Delete Course">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
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
                        <td class="no-print"></td>
                    </tr>
                </tbody>
            </table>
            <div class="gpa-section">GPA: ${semesterGPA} | CGPA: ${calculateCumulativeGPA()}</div>
        `;
        if (index < sortedSemesters.length - 1) {
            allTablesHTML += '<div style="margin-top: 40px; border-top: 2px solid #ccc; padding-top: 30px;" class="no-print"></div>';
        }
    });

    document.getElementById('transcriptHeader').innerHTML = '';
    document.getElementById('tableContainer').innerHTML = allTablesHTML;
    document.getElementById('gpaSection').innerHTML = `<strong>Cumulative GPA: ${calculateCumulativeGPA()}</strong>`;
    renderStats(allStats);
}

function renderStats(stats) {
    const averageScore = stats.totalCourses > 0 ? (stats.totalScore / stats.totalCourses).toFixed(2) : 0;
    const statsHTML = `
        <div class="stat-card"><h3>Total Courses</h3><div class="value">${stats.totalCourses}</div></div>
        <div class="stat-card"><h3>Total Credit Hours</h3><div class="value">${stats.totalCH}</div></div>
        <div class="stat-card"><h3>Average Score</h3><div class="value">${averageScore}</div></div>
        <div class="stat-card"><h3>CGPA</h3><div class="value">${calculateCumulativeGPA()}</div></div>
    `;
    document.getElementById('statsContainer').innerHTML = statsHTML;
}

// Initial Load
loadCourses();