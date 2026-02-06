# Build stage
FROM golang:1.25-alpine AS builder


# Install build dependencies
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy go.mod and go.sum separately to leverage Docker cache
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the code
COPY . .

# Build the Go application
RUN CGO_ENABLED=1 GOOS=linux go build -o main ./cmd/server/main.go

# Final stage
FROM alpine:latest

# Install sqlite for debugging (optional)
RUN apk add --no-cache sqlite-dev ca-certificates

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/main .

# Copy the frontend files
COPY --from=builder /app/public ./public

# Create the data directory
RUN mkdir ./data

# Expose the port (default 8081 if not provided)
EXPOSE 8081

# Command to run the application
CMD ["./main"]
