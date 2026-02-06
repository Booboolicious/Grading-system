package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

type Course struct {
	ID          int64   `json:"id"`
	CourseCode  string  `json:"courseCode"`
	CourseTitle string  `json:"courseTitle"`
	Semester    string  `json:"semester"`
	Session     string  `json:"session"`
	Level       string  `json:"level"`
	CreditHours int     `json:"creditHours"`
	Score       int     `json:"score"`
	Grade       string  `json:"grade"`
	QP          float64 `json:"qp"`
}


var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", "./data/grading_system.db")

	if err != nil {
		log.Fatal(err)
	}

	sqlStmt := `
	CREATE TABLE IF NOT EXISTS courses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		course_code TEXT,
		course_title TEXT,
		semester TEXT,
		session TEXT,
		level TEXT,
		credit_hours INTEGER,
		score INTEGER,
		grade TEXT,
		qp REAL
	);
	`

	_, err = db.Exec(sqlStmt)
	if err != nil {
		log.Printf("%q: %s\n", err, sqlStmt)
		log.Fatal(err)
	}
}

func getCoursesHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, course_code, course_title, semester, session, level, credit_hours, score, grade, qp FROM courses")

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var courses []Course
	for rows.Next() {
		var c Course
		err = rows.Scan(&c.ID, &c.CourseCode, &c.CourseTitle, &c.Semester, &c.Session, &c.Level, &c.CreditHours, &c.Score, &c.Grade, &c.QP)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		courses = append(courses, c)
	}


	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(courses)
}

func addCourseHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var c Course
	err := json.NewDecoder(r.Body).Decode(&c)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	stmt, err := db.Prepare("INSERT INTO courses(course_code, course_title, semester, session, level, credit_hours, score, grade, qp) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	res, err := stmt.Exec(c.CourseCode, c.CourseTitle, c.Semester, c.Session, c.Level, c.CreditHours, c.Score, c.Grade, c.QP)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := res.LastInsertId()
	c.ID = id

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func deleteCourseHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/api/courses/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	_, err = db.Exec("DELETE FROM courses WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func main() {
	initDB()
	defer db.Close()

	mux := http.NewServeMux()

	// API Routes
	mux.HandleFunc("/api/courses", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getCoursesHandler(w, r)
		case http.MethodPost:
			addCourseHandler(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/courses/", deleteCourseHandler)

	// Static files
	fs := http.FileServer(http.Dir("./public"))

	mux.Handle("/", fs)

	port := ":8081"
	fmt.Printf("Server starting at http://localhost%s\n", port)
	log.Fatal(http.ListenAndServe(port, mux))
}
