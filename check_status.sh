#!/bin/bash

echo "🌟 Impact Database Application Status"
echo "====================================="

# Check if the application is running
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Backend API is running!"
    echo ""
    echo "🔗 Available endpoints:"
    echo "   🏠 Homepage:      http://localhost:8000/"
    echo "   💚 Health Check:  http://localhost:8000/health"
    echo "   📚 API Docs:      http://localhost:8000/docs"
    echo "   📖 ReDoc:         http://localhost:8000/redoc"
    echo ""

    # Test the health endpoint
    echo "🩺 Health Status:"
    curl -s http://localhost:8000/health | python3 -m json.tool 2>/dev/null || echo "  Response received but not valid JSON"

    echo ""
    echo "📊 Server Info:"
    echo "   Environment: Development (Simplified)"
    echo "   Database: SQLite (local file)"
    echo "   Storage: Local filesystem"
    echo "   Port: 8000"

    # Check if there's a log file
    if [ -f "app_output.log" ]; then
        echo ""
        echo "📋 Recent log entries:"
        tail -5 app_output.log | sed 's/^/   /'
    fi

else
    echo "❌ Backend API is not running"
    echo ""
    echo "🚀 To start the application:"
    echo "   cd /home/kishank/impact-database"
    echo "   source fresh_venv/bin/activate"
    echo "   ./run_simple.sh"
    echo ""
    echo "🔍 Or start in background:"
    echo "   nohup ./run_simple.sh > app_output.log 2>&1 &"
fi

echo ""
echo "🛠️  Application Management:"
echo "   ▶️  Start: ./run_simple.sh"
echo "   🔍 Status: ./check_status.sh"
echo "   ⏹️  Stop: pkill -f 'uvicorn core.main_simple'"
echo ""

# Show running processes
echo "🔄 Related processes:"
ps aux | grep -E "(uvicorn|python.*main_simple)" | grep -v grep | sed 's/^/   /' || echo "   No related processes found"
