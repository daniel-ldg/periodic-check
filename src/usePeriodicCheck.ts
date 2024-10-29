// src/usePeriodicCheck.ts
import { PeriodicCheck, IntervalConfig, CheckStatus, CheckEventData } from "./PeriodicCheck";

// Only import types from React
import type { useEffect, useState, useRef } from "react";

// Declare React types we need
type ReactModule = {
	useEffect: typeof useEffect;
	useState: typeof useState;
	useRef: typeof useRef;
};

let React: ReactModule;

// Dynamic React import with proper type checking
try {
	React = require("react");
} catch {
	React = null as any;
}

interface UsePeriodicCheckOptions {
	intervalConfig: IntervalConfig;
	checkFn: () => Promise<boolean>;
}

export const usePeriodicCheck = !React
	? undefined // Return undefined if React is not available
	: ({ intervalConfig, checkFn }: UsePeriodicCheckOptions) => {
			const { useState, useEffect, useRef } = React;
			const [status, setStatus] = useState<CheckStatus>("healthy");
			const [history, setHistory] = useState<Array<{ status: CheckStatus; timestamp: number }>>([]);
			const [metrics, setMetrics] = useState<{
				availability: number;
				statusCounts: Record<CheckStatus, number>;
				currentStreak: number;
			} | null>(null);

			const periodicCheckRef = useRef<PeriodicCheck | null>(null);

			useEffect(() => {
				periodicCheckRef.current = new PeriodicCheck(intervalConfig);
				periodicCheckRef.current.check(checkFn);

				const updateStates = (data: CheckEventData) => {
					setStatus(data.status);
					setHistory(data.history);
					setMetrics(data.metrics);
				};

				periodicCheckRef.current.on("healthy", updateStates);
				periodicCheckRef.current.on("suspect", updateStates);
				periodicCheckRef.current.on("unhealthy", updateStates);

				periodicCheckRef.current.on("error", error => {
					console.error("PeriodicCheck error:", error);
				});

				return () => {
					periodicCheckRef.current?.stop();
				};
			}, [intervalConfig, checkFn]);

			return {
				status,
				history,
				metrics,
			};
	  };
