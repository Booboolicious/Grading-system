package main

import (
	"context"
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
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/facebook"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
)

var (
	googleOauthConfig = &oauth2.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
		Endpoint:     google.Endpoint,
	}
	githubOauthConfig = &oauth2.Config{
		ClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		ClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		Scopes:       []string{"user:email", "read:user"},
		Endpoint:     github.Endpoint,
	}
	facebookOauthConfig = &oauth2.Config{
		ClientID:     os.Getenv("FACEBOOK_CLIENT_ID"),
		ClientSecret: os.Getenv("FACEBOOK_CLIENT_SECRET"),
		Scopes:       []string{"email", "public_profile"},
		Endpoint:     facebook.Endpoint,
	}
)

const oauthStateString = "grading_system_oauth_state"

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
	Password string `json:"password"`
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
		password_hash TEXT,
		oauth_id TEXT,
		oauth_provider TEXT,
		email TEXT
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
		log.Fatal(err)
	}

	// Migrations for existing data
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN oauth_id TEXT")
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN oauth_provider TEXT")
	_, _ = db.Exec("ALTER TABLE users ADD COLUMN email TEXT")
	_, _ = db.Exec("ALTER TABLE courses ADD COLUMN user_id INTEGER REFERENCES users(id)")
}

func signupHandler(w http.ResponseWriter, r *http.Request) {
	var u User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
	_, err := db.Exec("INSERT INTO users (username, password_hash) VALUES (?, ?)", u.Username, string(hash))
	if err != nil {
		http.Error(w, "Username already exists", http.StatusConflict)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var u User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}
	var id int64
	var hash string
	err := db.QueryRow("SELECT id, password_hash FROM users WHERE username = ?", u.Username).Scan(&id, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(u.Password)) != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"userId": id, "username": u.Username})
}

// OAuth Handlers
func loginRedirect(cfg *oauth2.Config, provider string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		protocol := "http"
		if r.TLS != nil || os.Getenv("PORT") != "" { protocol = "https" }
		cfg.RedirectURL = fmt.Sprintf("%s://%s/api/auth/%s/callback", protocol, host, provider)
		url := cfg.AuthCodeURL(oauthStateString)
		http.Redirect(w, r, url, http.StatusTemporaryRedirect)
	}
}

func handleOAuthCallback(provider string, getUserInfo func(token *oauth2.Token) (string, string, string, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.FormValue("state") != oauthStateString {
			http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
			return
		}

		var cfg *oauth2.Config
		switch provider {
		case "google": cfg = googleOauthConfig
		case "github": cfg = githubOauthConfig
		case "facebook": cfg = facebookOauthConfig
		}

		token, err := cfg.Exchange(context.Background(), r.FormValue("code"))
		if err != nil {
			http.Error(w, "Exchange failed", http.StatusInternalServerError)
			return
		}

		oauthID, email, name, err := getUserInfo(token)
		if err != nil {
			http.Error(w, "Failed to get user info", http.StatusInternalServerError)
			return
		}

		var userID int64
		err = db.QueryRow("SELECT id FROM users WHERE oauth_id = ? AND oauth_provider = ?", oauthID, provider).Scan(&userID)
		if err == sql.ErrNoRows {
			username := email
			if username == "" { username = name }
			res, _ := db.Exec("INSERT INTO users (username, email, oauth_id, oauth_provider) VALUES (?, ?, ?, ?)", username, email, oauthID, provider)
			userID, _ = res.LastInsertId()
		}

		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, `<script>
			localStorage.setItem('user', JSON.stringify({userId: %d, username: '%s'}));
			window.location.href = '/';
		</script>`, userID, email)
	}
}

func main() {
	initDB()
	defer db.Close()
	mux := http.NewServeMux()
	
	mux.HandleFunc("/api/signup", signupHandler)
	mux.HandleFunc("/api/login", loginHandler)
	
	// OAuth Routes
	mux.HandleFunc("/api/auth/google/login", loginRedirect(googleOauthConfig, "google"))
	mux.HandleFunc("/api/auth/google/callback", handleOAuthCallback("google", func(t *oauth2.Token) (string, string, string, error) {
		resp, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + t.AccessToken)
		if err != nil { return "", "", "", err }
		defer resp.Body.Close()
		var res struct { ID string `json:"id"`; Email string `json:"email"`; Name string `json:"name"` }
		json.NewDecoder(resp.Body).Decode(&res)
		return res.ID, res.Email, res.Name, nil
	}))

	mux.HandleFunc("/api/auth/github/login", loginRedirect(githubOauthConfig, "github"))
	mux.HandleFunc("/api/auth/github/callback", handleOAuthCallback("github", func(t *oauth2.Token) (string, string, string, error) {
		client := githubOauthConfig.Client(context.Background(), t)
		resp, err := client.Get("https://api.github.com/user")
		if err != nil { return "", "", "", err }
		defer resp.Body.Close()
		var res struct { ID int64 `json:"id"`; Email string `json:"email"`; Login string `json:"login"` }
		json.NewDecoder(resp.Body).Decode(&res)
		return strconv.FormatInt(res.ID, 10), res.Email, res.Login, nil
	}))

	mux.HandleFunc("/api/auth/facebook/login", loginRedirect(facebookOauthConfig, "facebook"))
	mux.HandleFunc("/api/auth/facebook/callback", handleOAuthCallback("facebook", func(t *oauth2.Token) (string, string, string, error) {
		resp, err := http.Get("https://graph.facebook.com/me?fields=id,name,email&access_token=" + t.AccessToken)
		if err != nil { return "", "", "", err }
		defer resp.Body.Close()
		var res struct { ID string `json:"id"`; Email string `json:"email"`; Name string `json:"name"` }
		json.NewDecoder(resp.Body).Decode(&res)
		return res.ID, res.Email, res.Name, nil
	}))

	// Course Routes
	mux.HandleFunc("/api/courses", func(w http.ResponseWriter, r *http.Request) {
		uid, _ := strconv.ParseInt(r.Header.Get("X-User-ID"), 10, 64)
		if uid == 0 { http.Error(w, "Unauthorized", 401); return }
		if r.Method == "GET" {
			rows, _ := db.Query("SELECT id, user_id, course_code, course_title, semester, session, level, credit_hours, score, grade, qp FROM courses WHERE user_id = ?", uid)
			defer rows.Close()
			var courses []Course
			for rows.Next() {
				var c Course
				rows.Scan(&c.ID, &c.UserID, &c.CourseCode, &c.CourseTitle, &c.Semester, &c.Session, &c.Level, &c.CreditHours, &c.Score, &c.Grade, &c.QP)
				courses = append(courses, c)
			}
			json.NewEncoder(w).Encode(courses)
		} else {
			var c Course
			json.NewDecoder(r.Body).Decode(&c)
			res, _ := db.Exec("INSERT INTO courses (user_id, course_code, course_title, semester, session, level, credit_hours, score, grade, qp) VALUES (?,?,?,?,?,?,?,?,?,?)",
				uid, c.CourseCode, c.CourseTitle, c.Semester, c.Session, c.Level, c.CreditHours, c.Score, c.Grade, c.QP)
			id, _ := res.LastInsertId()
			c.ID = id
			c.UserID = uid
			json.NewEncoder(w).Encode(c)
		}
	})
	mux.HandleFunc("/api/courses/", func(w http.ResponseWriter, r *http.Request) {
		uid, _ := strconv.ParseInt(r.Header.Get("X-User-ID"), 10, 64)
		id, _ := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/api/courses/"), 10, 64)
		db.Exec("DELETE FROM courses WHERE id = ? AND user_id = ?", id, uid)
		w.WriteHeader(204)
	})

	mux.Handle("/", http.FileServer(http.Dir("./public")))
	port := os.Getenv("PORT")
	if port == "" { port = "8081" }
	fmt.Println("Server at :" + port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
