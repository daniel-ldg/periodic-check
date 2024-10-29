# periodic-check

Smart health checking with adaptive intervals. Automatically adjusts check frequency based on system health state.

## Features

-   🎯 **Adaptive Intervals** - Check more frequently when issues are detected
-   🔄 **Smart State Management** - Prevents status flapping with configurable thresholds
-   📊 **Built-in Metrics** - Track availability, status history, and trends
-   🎛 **Flexible Configuration** - Customize intervals and thresholds for your needs
-   🪝 **Event System** - React to status changes and track transitions

## Installation

```bash
npm i periodic-check
```

## Quick Start

```javascript
import { PeriodicCheck } from "periodic-check";

// Create a checker with custom intervals (in milliseconds)
const checker = new PeriodicCheck({
	healthy: 30000, // 30s when healthy
	suspect: 5000, // 5s when suspect
	unhealthy: 1000, // 1s when unhealthy
});

// Add status listeners
checker
	.on("healthy", data => console.log("All good!", data.metrics))
	.on("suspect", data => console.log("Warning...", data.metrics))
	.on("unhealthy", data => console.log("System down!", data.metrics));

// Start checking
checker.check(async () => {
	const response = await fetch("https://api.example.com/health");
	return response.status === 200;
});
```

## Configuration

```javascript
const checker = new PeriodicCheck({
	// Required: Check intervals for each state
	healthy: 30000, // Time between checks when healthy
	suspect: 5000, // Time between checks when suspect
	unhealthy: 1000, // Time between checks when unhealthy

	// Optional: State transition configuration
	maxSuspectCount: 3, // Failed checks before going unhealthy (default: 3)
	minHealthyCount: 2, // Successful checks needed for recovery (default: 2)
});
```

## State Transitions

The checker moves through three states:

1. **Healthy** → **Suspect**
    - Occurs after first failed check
    - Increases check frequency
2. **Suspect** → **Unhealthy**
    - After `maxSuspectCount` consecutive failures
    - Further increases check frequency
3. **Unhealthy/Suspect** → **Healthy**
    - After `minHealthyCount` consecutive successes
    - Returns to normal check frequency

## Events

```javascript
checker.on("healthy", data => {
	// data = {
	//   status: 'healthy',
	//   metrics: {
	//     availability: 0.98,
	//     statusCounts: { healthy: 45, suspect: 3, unhealthy: 0 },
	//     currentStreak: 10
	//   },
	//   history: [/* recent status changes */]
	// }
});

// Available events:
// - 'healthy'
// - 'suspect'
// - 'unhealthy'
// - 'error'
```

## Metrics

Access health check metrics at any time:

```javascript
// Get metrics for the last hour
const metrics = checker.getMetrics();

// Get custom time range history
const recentHistory = checker.getRecentHistory(30); // last 30 minutes
```

## Use Cases

### API Health Monitoring

```javascript
const apiChecker = new PeriodicCheck({
	healthy: 60000, // 1 minute
	suspect: 10000, // 10 seconds
	unhealthy: 2000, // 2 seconds
});

apiChecker.check(async () => {
	try {
		const response = await fetch("https://api.example.com/health");
		return response.status === 200;
	} catch {
		return false;
	}
});
```

### Database Connection

```javascript
const dbChecker = new PeriodicCheck({
	healthy: 30000,
	suspect: 5000,
	unhealthy: 1000,
});

dbChecker.check(async () => {
	try {
		await db.query("SELECT 1");
		return true;
	} catch {
		return false;
	}
});
```

### Resource Monitoring

```javascript
const memoryChecker = new PeriodicCheck({
	healthy: 15000,
	suspect: 5000,
	unhealthy: 1000,
});

memoryChecker.check(async () => {
	const usage = process.memoryUsage();
	return usage.heapUsed < 1000000000; // 1GB
});
```

## Error Handling

The checker treats any thrown errors as failed checks:

```javascript
checker
	.on("error", error => console.error("Check failed:", error))
	.check(async () => {
		// Any errors here will trigger the 'error' event
		// and be treated as a failed check
		throw new Error("Connection failed");
	});
```

## Cleanup

Don't forget to stop the checker when done:

```javascript
// Clean up timers
checker.stop();
```

## License

ISC
