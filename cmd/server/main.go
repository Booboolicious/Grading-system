package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

type Course struct {
	ID          int64   `json:"id"`
	UserID      int64   `json:"userId"`
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

type User struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Password string `json:"password"` // Used for login/signup input
}

var db *sql.DB

func initDB() {
	var err error
	dbPath := os.Getenv("DATABASE_URL")
	if dbPath == "" {
		dbPath = "./data/grading_system.db"
	}
	db, err = sql.Open("sqlite3", dbPath)

	if err != nil {
		log.Fatal(err)
	}

	sqlStmt := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE,
		password_hash TEXT
	);

	CREATE TABLE IF NOT EXISTS courses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		course_code TEXT,
		course_title TEXT,
		semester TEXT,
		session TEXT,
		level TEXT,
		credit_hours INTEGER,
		score INTEGER,
		grade TEXT,
		qp REAL,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`

	_, err = db.Exec(sqlStmt)
	if err != nil {
		log.Printf("%q: %s\n", err, sqlStmt)
		log.Fatal(err)
	}

	// Add user_id column if it doesn't exist (migration for existing database)
	_, _ = db.Exec("ALTER TABLE courses ADD COLUMN user_id INTEGER REFERENCES users(id)")
}

func signupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var u User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}
	if u.Username == "" || u.Password == "" {
		http.Error(w, "Username and password required", http.StatusBadRequest)
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
	_, err := db.Exec("INSERT INTO users (username, password_hash) VALUES (?, ?)", u.Username, string(hash))
	if err != nil {
		http.Error(w, "Username already exists", http.StatusConflict)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"message": "User created successfully"})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var u User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}
	var id int64
	var hash string
	err := db.QueryRow("SELECT id, password_hash FROM users WHERE username = ?", u.Username).Scan(&id, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(u.Password)) != nil {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  "Login successful",
		"userId":   id,
		"username": u.Username,
	})
}

func getLoggedInUserID(r *http.Request) int64 {
	idStr := r.Header.Get("X-User-ID")
	id, _ := strconv.ParseInt(idStr, 10, 64)
	return id
}

func getCoursesHandler(w http.ResponseWriter, r *http.Request) {
	userID := getLoggedInUserID(r)
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := db.Query("SELECT id, user_id, course_code, course_title, semester, session, level, credit_hours, score, grade, qp FROM courses WHERE user_id = ?", userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var courses []Course
	for rows.Next() {
		var c Course
		err = rows.Scan(&c.ID, &c.UserID, &c.CourseCode, &c.CourseTitle, &c.Semester, &c.Session, &c.Level, &c.CreditHours, &c.Score, &c.Grade, &c.QP)
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
	userID := getLoggedInUserID(r)
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var c Course
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	stmt, err := db.Prepare("INSERT INTO courses(user_id, course_code, course_title, semester, session, level, credit_hours, score, grade, qp) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	res, err := stmt.Exec(userID, c.CourseCode, c.CourseTitle, c.Semester, c.Session, c.Level, c.CreditHours, c.Score, c.Grade, c.QP)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	id, _ := res.LastInsertId()
	c.ID = id
	c.UserID = userID

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(c)
}

func deleteCourseHandler(w http.ResponseWriter, r *http.Request) {
	userID := getLoggedInUserID(r)
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/api/courses/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	res, err := db.Exec("DELETE FROM courses WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Course not found or unauthorized", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func main() {
	initDB()
	defer db.Close()

	mux := http.NewServeMux()

	mux.HandleFunc("/api/signup", signupHandler)
	mux.HandleFunc("/api/login", loginHandler)

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

	fs := http.FileServer(http.Dir("./public"))
	mux.Handle("/", fs)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	fmt.Printf("Server starting at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
