#!/bin/bash

# Performance Test Runner Script
# This script runs all performance tests and generates a consolidated report

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL=${BASE_URL:-"http://localhost:3000"}
RESULTS_DIR="results/$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="$RESULTS_DIR/performance-report.html"

# Create results directory
mkdir -p "$RESULTS_DIR"

echo -e "${GREEN}Starting ZKFair Performance Test Suite${NC}"
echo "Base URL: $BASE_URL"
echo "Results will be saved to: $RESULTS_DIR"
echo ""

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local duration=$3
    
    echo -e "${YELLOW}Running $test_name...${NC}"
    echo "Expected duration: $duration"
    
    # Run the test
    if k6 run \
        --out json="$RESULTS_DIR/${test_name}-results.json" \
        --summary-export="$RESULTS_DIR/${test_name}-summary.json" \
        -e BASE_URL="$BASE_URL" \
        "$test_file"; then
        echo -e "${GREEN}✓ $test_name completed successfully${NC}"
    else
        echo -e "${RED}✗ $test_name failed${NC}"
        return 1
    fi
    
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check if k6 is installed
    if ! command -v k6 &> /dev/null; then
        echo -e "${RED}k6 is not installed. Please install k6 first.${NC}"
        echo "Visit: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
    
    # Check if server is running
    if ! curl -s "$BASE_URL/health" > /dev/null; then
        echo -e "${RED}Server is not responding at $BASE_URL${NC}"
        echo "Please ensure the server is running before running tests."
        exit 1
    fi
    
    echo -e "${GREEN}✓ All prerequisites met${NC}"
    echo ""
}

# Function to generate consolidated report
generate_report() {
    echo -e "${YELLOW}Generating consolidated report...${NC}"
    
    cat > "$REPORT_FILE" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>ZKFair Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; }
        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .test-section { margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .metric-card { padding: 15px; background: white; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { color: #666; font-size: 14px; }
        .status-good { color: #28a745; }
        .status-warning { color: #ffc107; }
        .status-bad { color: #dc3545; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #007bff; color: white; }
        .timestamp { color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>ZKFair Performance Test Report</h1>
        <p class="timestamp">Generated: $(date)</p>
        <p>Base URL: $BASE_URL</p>
EOF

    # Add test results if they exist
    for test in "load" "stress" "spike" "soak"; do
        if [ -f "$RESULTS_DIR/${test}-test-summary.json" ]; then
            echo "<div class='test-section'>" >> "$REPORT_FILE"
            echo "<h2>${test^} Test Results</h2>" >> "$REPORT_FILE"
            
            # Extract key metrics using jq if available
            if command -v jq &> /dev/null; then
                local summary=$(cat "$RESULTS_DIR/${test}-test-summary.json")
                
                echo "<div class='metrics'>" >> "$REPORT_FILE"
                
                # Extract and display metrics
                echo "<div class='metric-card'>" >> "$REPORT_FILE"
                echo "<div class='metric-label'>Total Requests</div>" >> "$REPORT_FILE"
                echo "<div class='metric-value'>$(echo "$summary" | jq -r '.metrics.http_reqs.count // 0' | xargs printf "%'.0f")</div>" >> "$REPORT_FILE"
                echo "</div>" >> "$REPORT_FILE"
                
                echo "<div class='metric-card'>" >> "$REPORT_FILE"
                echo "<div class='metric-label'>Avg Response Time</div>" >> "$REPORT_FILE"
                echo "<div class='metric-value'>$(echo "$summary" | jq -r '.metrics.http_req_duration.avg // 0' | xargs printf "%.0f")ms</div>" >> "$REPORT_FILE"
                echo "</div>" >> "$REPORT_FILE"
                
                echo "<div class='metric-card'>" >> "$REPORT_FILE"
                echo "<div class='metric-label'>Error Rate</div>" >> "$REPORT_FILE"
                local error_rate=$(echo "$summary" | jq -r '.metrics.http_req_failed.values.rate // 0' | awk '{printf "%.2f", $1 * 100}')
                local status_class="status-good"
                if (( $(echo "$error_rate > 10" | bc -l) )); then
                    status_class="status-bad"
                elif (( $(echo "$error_rate > 5" | bc -l) )); then
                    status_class="status-warning"
                fi
                echo "<div class='metric-value $status_class'>${error_rate}%</div>" >> "$REPORT_FILE"
                echo "</div>" >> "$REPORT_FILE"
                
                echo "</div>" >> "$REPORT_FILE"
            fi
            
            echo "</div>" >> "$REPORT_FILE"
        fi
    done

    cat >> "$REPORT_FILE" << 'EOF'
        <h2>Test Execution Summary</h2>
        <table>
            <tr>
                <th>Test</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Details</th>
            </tr>
EOF

    # Add test execution details
    for test in "load" "stress" "spike" "soak"; do
        if [ -f "$RESULTS_DIR/${test}-test-summary.json" ]; then
            echo "<tr><td>${test^} Test</td><td class='status-good'>✓ Completed</td><td>-</td><td><a href='${test}-test-summary.json'>View Details</a></td></tr>" >> "$REPORT_FILE"
        else
            echo "<tr><td>${test^} Test</td><td>Not Run</td><td>-</td><td>-</td></tr>" >> "$REPORT_FILE"
        fi
    done

    cat >> "$REPORT_FILE" << 'EOF'
        </table>
    </div>
</body>
</html>
EOF
    
    echo -e "${GREEN}✓ Report generated: $REPORT_FILE${NC}"
}

# Main execution
main() {
    check_prerequisites
    
    # Parse command line arguments
    TESTS_TO_RUN=("load" "spike")  # Default tests
    
    if [ "$1" == "all" ]; then
        TESTS_TO_RUN=("load" "stress" "spike" "soak")
    elif [ "$1" == "quick" ]; then
        TESTS_TO_RUN=("load")
    elif [ "$1" == "extended" ]; then
        TESTS_TO_RUN=("load" "spike" "soak")
    fi
    
    echo "Tests to run: ${TESTS_TO_RUN[*]}"
    echo ""
    
    # Run selected tests
    for test in "${TESTS_TO_RUN[@]}"; do
        case $test in
            "load")
                run_test "load-test" "load-test.js" "~10 minutes"
                ;;
            "stress")
                run_test "stress-test" "stress-test.js" "~15 minutes"
                ;;
            "spike")
                run_test "spike-test" "spike-test.js" "~10 minutes"
                ;;
            "soak")
                echo -e "${YELLOW}Note: Soak test runs for 4+ hours${NC}"
                read -p "Run soak test? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    run_test "soak-test" "soak-test.js" "~4.5 hours"
                fi
                ;;
        esac
    done
    
    # Generate consolidated report
    generate_report
    
    echo ""
    echo -e "${GREEN}Performance test suite completed!${NC}"
    echo "Results saved to: $RESULTS_DIR"
    echo "Open the report: $REPORT_FILE"
}

# Show usage
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: $0 [quick|all|extended]"
    echo ""
    echo "Options:"
    echo "  quick    - Run only load test (~10 minutes)"
    echo "  all      - Run all tests including soak test (4+ hours)"
    echo "  extended - Run load, spike, and soak tests"
    echo "  (default) - Run load and spike tests (~20 minutes)"
    echo ""
    echo "Environment variables:"
    echo "  BASE_URL - API base URL (default: http://localhost:3000)"
    exit 0
fi

# Run main function
main "$@"