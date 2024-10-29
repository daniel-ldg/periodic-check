export type CheckStatus = "healthy" | "suspect" | "unhealthy" | "error";

export type IntervalConfig = {
	healthy: number; // Interval in ms when status is good
	suspect: number; // Interval when issues detected
	unhealthy: number; // Interval when confirmed unhealthy
	maxSuspectCount?: number; // How many suspect states before unhealthy
	minHealthyCount?: number; // How many successes needed to recover
};

export type CheckFunction = () => Promise<boolean>;

export interface CheckEventData {
	status: CheckStatus;
	history: Array<{ status: CheckStatus; timestamp: number }>;
	metrics: {
		availability: number;
		statusCounts: Record<CheckStatus, number>;
		currentStreak: number;
	};
}

export type StatusListener = (data: CheckEventData) => void;
export type ErrorListener = (error: Error) => void;

type OptionalIntervalConfig = Required<
	Pick<
		IntervalConfig,
		Exclude<
			{
				[K in keyof IntervalConfig]: undefined extends IntervalConfig[K] ? K : never;
			}[keyof IntervalConfig],
			undefined
		>
	>
>;

const DEFAULT_OPTIONAL_INTERVAL_CONFIG: OptionalIntervalConfig = {
	maxSuspectCount: 3,
	minHealthyCount: 2,
};

export class PeriodicCheck {
	private intervals: Required<IntervalConfig>;
	private checkFn: CheckFunction | undefined;
	private currentStatus: CheckStatus = "healthy";
	private timer: ReturnType<typeof setTimeout> | null = null;
	private suspectCount = 0;
	private healthyCount = 0;
	private listeners: Map<CheckStatus, Array<StatusListener | ErrorListener>> = new Map();
	private history: Array<{ status: CheckStatus; timestamp: number }> = [];

	constructor(intervals: IntervalConfig) {
		this.intervals = { ...DEFAULT_OPTIONAL_INTERVAL_CONFIG, ...intervals };
	}

	check(fn: CheckFunction) {
		this.checkFn = fn;
		this.notifyListeners();
		this.scheduleNext();
		return this;
	}

	private async runCheck() {
		try {
			if (!this.checkFn) {
				throw new Error("Check function is not defined");
			}
			const isHealthy = await this.checkFn();
			this.updateStatus(isHealthy);
			this.scheduleNext();
		} catch (error) {
			this.handleError(error instanceof Error ? error : new Error("Unknown error"));
		}
	}

	private updateStatus(isHealthy: boolean) {
		const prevStatus = this.currentStatus;

		if (isHealthy) {
			this.healthyCount++;
			this.suspectCount = 0;

			if (this.healthyCount >= this.intervals.minHealthyCount) {
				this.transitionTo("healthy");
			}
		} else {
			this.healthyCount = 0;

			if (this.currentStatus === "healthy") {
				this.suspectCount++;
				if (this.suspectCount >= this.intervals.maxSuspectCount) {
					this.transitionTo("unhealthy");
				} else {
					this.transitionTo("suspect");
				}
			} else if (this.currentStatus === "suspect") {
				this.suspectCount++;
				if (this.suspectCount >= this.intervals.maxSuspectCount) {
					this.transitionTo("unhealthy");
				}
			}
		}

		this.history.push({
			status: this.currentStatus,
			timestamp: Date.now(),
		});

		if (this.history.length > 100) {
			this.history.shift();
		}

		if (prevStatus !== this.currentStatus) {
			this.notifyListeners();
		}
	}

	private createEventData(): CheckEventData {
		return {
			status: this.currentStatus,
			history: this.getRecentHistory(),
			metrics: this.getMetrics(),
		};
	}

	private transitionTo(status: CheckStatus) {
		this.currentStatus = status;
	}

	private scheduleNext() {
		if (this.timer) {
			clearTimeout(this.timer);
		}

		let intervalStatus = this.currentStatus;
		if (intervalStatus === "error") {
			intervalStatus = "unhealthy";
		}

		const interval = this.intervals[intervalStatus];
		this.timer = setTimeout(() => this.runCheck(), interval);
	}

	private handleError(error: Error) {
		this.updateStatus(false);
		this.scheduleNext();

		const errorListeners = this.listeners.get("error") || [];
		errorListeners.forEach(listener => (listener as ErrorListener)(error));
	}

	on(status: CheckStatus, listener: StatusListener): this;
	on(status: "error", listener: ErrorListener): this;
	on(status: CheckStatus | "error", listener: StatusListener | ErrorListener) {
		if (!this.listeners.has(status)) {
			this.listeners.set(status, []);
		}
		this.listeners.get(status)!.push(listener);
		return this;
	}

	private notifyListeners() {
		const eventData = this.createEventData();
		const listeners = this.listeners.get(this.currentStatus) || [];
		listeners.forEach(listener => (listener as StatusListener)(eventData));
	}

	getRecentHistory(minutes: number = 60) {
		const cutoff = Date.now() - minutes * 60 * 1000;
		return this.history.filter(entry => entry.timestamp >= cutoff);
	}

	getMetrics(): CheckEventData["metrics"] {
		const recentHistory = this.getRecentHistory();
		const total = recentHistory.length;

		if (total === 0) {
			return {
				availability: 1,
				currentStreak: 1,
				statusCounts: { healthy: 1, suspect: 0, unhealthy: 0, error: 0 },
			};
		}

		const counts = recentHistory.reduce((acc, entry) => {
			acc[entry.status] = (acc[entry.status] || 0) + 1;
			return acc;
		}, {} as Record<CheckStatus, number>);

		return {
			availability: (counts.healthy || 0) / total,
			statusCounts: counts,
			currentStreak: this.getCurrentStreak(),
		};
	}

	private getCurrentStreak() {
		if (this.history.length === 0) return 0;

		let streak = 1;
		const currentStatus = this.history[this.history.length - 1].status;

		for (let i = this.history.length - 2; i >= 0; i--) {
			if (this.history[i].status === currentStatus) {
				streak++;
			} else {
				break;
			}
		}

		return streak;
	}

	stop() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
