import { PeriodicCheck, CheckEventData, CheckStatus } from "../src";

describe("PeriodicCheck", () => {
	// Helper to create a mock check function
	const createMockCheck = (results: boolean[]) => {
		let callCount = 0;
		return jest.fn().mockImplementation(async () => {
			const result = results[callCount % results.length];
			callCount++;
			return result;
		});
	};

	// Helper to wait for a specific duration
	const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

	// Helper to advance timers and flush promises
	const advanceTimersByTimeAndFlush = async (ms: number) => {
		jest.advanceTimersByTime(ms);
		// Flush all pending promises and timers
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	};

	beforeEach(() => {
		jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
	});

	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	describe("Basic Functionality", () => {
		test("should initialize with healthy status", async () => {
			const check = new PeriodicCheck({
				healthy: 1000,
				suspect: 500,
				unhealthy: 2000,
			});

			const statusChanges: string[] = [];
			const listener = jest.fn((data: CheckEventData) => {
				statusChanges.push(data.status);
			});

			check.on("healthy", listener);

			const mockCheck = createMockCheck([true, true]);
			check.check(mockCheck);

			await advanceTimersByTimeAndFlush(2000);

			expect(mockCheck).toHaveBeenCalled();
			expect(statusChanges.at(-1)).toContain("healthy");
		});

		test("should transition to suspect after first failure", async () => {
			const check = new PeriodicCheck({
				healthy: 1000,
				suspect: 500,
				unhealthy: 2000,
			});

			const suspectListener = jest.fn();
			check.on("suspect", suspectListener);

			const mockCheck = createMockCheck([false]);
			check.check(mockCheck);

			await advanceTimersByTimeAndFlush(1000);

			expect(suspectListener).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "suspect",
				})
			);
		});

		test("should transition to unhealthy after maxSuspectCount failures", async () => {
			const check = new PeriodicCheck({
				healthy: 1000,
				suspect: 500,
				unhealthy: 2000,
				maxSuspectCount: 2,
			});

			const statusChanges: CheckStatus[] = [];
			const validStatuses: CheckStatus[] = ["healthy", "suspect", "unhealthy"];

			validStatuses.forEach(status => {
				check.on(status, (data: CheckEventData) => {
					statusChanges.push(data.status);
				});
			});

			const mockCheck = createMockCheck([false]);
			check.check(mockCheck);

			await advanceTimersByTimeAndFlush(1000);
			await advanceTimersByTimeAndFlush(500);
			await advanceTimersByTimeAndFlush(500);

			expect(statusChanges).toContain("unhealthy");
		});
	});

	describe("Recovery", () => {
		test("should recover to healthy after minHealthyCount successes", async () => {
			const check = new PeriodicCheck({
				healthy: 1000,
				suspect: 500,
				unhealthy: 2000,
				minHealthyCount: 2,
			});

			const statusChanges: CheckStatus[] = [];
			check.on("healthy", (data: CheckEventData) => {
				statusChanges.push(data.status);
			});

			const mockCheck = createMockCheck([false, true, true]);
			check.check(mockCheck);

			await advanceTimersByTimeAndFlush(1000); // First check (false)
			await advanceTimersByTimeAndFlush(500); // Second check (true)
			await advanceTimersByTimeAndFlush(500); // Third check (true)

			expect(statusChanges).toContain("healthy");
		});
	});

	describe("Error Handling", () => {
		test("should handle errors appropriately", async () => {
			const check = new PeriodicCheck({
				healthy: 1000,
				suspect: 500,
				unhealthy: 2000,
			});

			const errorListener = jest.fn();
			const statusListener = jest.fn();
			const error = new Error("Test error");

			check.on("error", errorListener);
			check.on("unhealthy", statusListener);

			const mockCheck = jest.fn().mockRejectedValueOnce(error);
			check.check(mockCheck);

			await advanceTimersByTimeAndFlush(1000);

			expect(errorListener).toHaveBeenCalledWith(error);
			expect(mockCheck).toHaveBeenCalled();
		});
	});

	describe("Metrics", () => {
		test("should calculate metrics correctly", async () => {
			jest.useRealTimers(); // Use real timers for this specific test

			const check = new PeriodicCheck({
				healthy: 50, // Use smaller intervals for faster test
				suspect: 50,
				unhealthy: 50,
			});

			// Create a promise that resolves after we've collected enough data
			const dataCollected = new Promise<void>(resolve => {
				const samples = [];
				const listener = (data: CheckEventData) => {
					samples.push(data);
					if (samples.length >= 3) {
						resolve();
					}
				};

				check.on("healthy", listener);
				check.on("suspect", listener);
				check.on("unhealthy", listener);
			});

			const mockCheck = createMockCheck([true, false, true]);
			check.check(mockCheck);

			// Wait for enough data to be collected
			await dataCollected;
			check.stop();

			const metrics = check.getMetrics();

			expect(metrics).toMatchObject({
				availability: expect.any(Number),
				statusCounts: expect.any(Object),
				currentStreak: expect.any(Number),
			});

			expect(metrics.availability).toBeGreaterThanOrEqual(0);
			expect(metrics.availability).toBeLessThanOrEqual(1);
			expect(Object.keys(metrics.statusCounts)).toContain("healthy");
		});
	});

	describe("Cleanup", () => {
		test("should stop checking when stop is called", async () => {
			const check = new PeriodicCheck({
				healthy: 1000,
				suspect: 500,
				unhealthy: 2000,
			});

			const mockCheck = createMockCheck([true]);
			check.check(mockCheck);

			check.stop();
			await advanceTimersByTimeAndFlush(2000);

			expect(mockCheck).not.toHaveBeenCalled();
		});
	});
});
