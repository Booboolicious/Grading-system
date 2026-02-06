#!/bin/bash

# Auto-commit script for Git repository
# This script watches for changes and automatically commits them

# Configuration
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_INTERVAL=300  # Check every 5 minutes (300 seconds)
AUTO_PUSH=true     # Set to true if you want to auto-push to remote

echo "🚀 Auto-commit script started for: $REPO_DIR"
echo "⏱️  Checking for changes every $CHECK_INTERVAL seconds"
echo "📤 Auto-push to remote: $AUTO_PUSH"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$REPO_DIR" || exit 1

while true; do
    # Check if there are any changes
    if [[ -n $(git status -s) ]]; then
        echo "📝 Changes detected at $(date '+%Y-%m-%d %H:%M:%S')"
        
        # Add all changes
        git add -A
        
        # Create a commit with timestamp
        COMMIT_MSG="Auto-commit: $(date '+%Y-%m-%d %H:%M:%S')"
        git commit -m "$COMMIT_MSG"
        
        echo "✅ Committed: $COMMIT_MSG"
        
        # Push to remote if enabled
        if [ "$AUTO_PUSH" = true ]; then
            echo "📤 Pushing to remote..."
            if git push; then
                echo "✅ Successfully pushed to remote"
            else
                echo "❌ Failed to push to remote"
            fi
        fi
        
        echo ""
    else
        echo "⏳ No changes detected at $(date '+%Y-%m-%d %H:%M:%S')"
    fi
    
    # Wait before next check
    sleep $CHECK_INTERVAL
done
