import React, { useState, useEffect } from "react";
import { Play, SkipForward, RotateCcw, Settings, FileText } from "lucide-react";
import {
  DEFAULT_CONFIG,
  INITIAL_REGISTERS,
  SAMPLE_CODE_SEQUENTIAL,
  SAMPLE_CODE_LOOP,
} from "./constants";
import { parseAssembly } from "./services/parser";
import { initializeState, nextCycle } from "./services/tomasulo";
import { SimulationState, SystemConfig, OpType } from "./types";
import { SimulationView } from "./components/SimulationView";

const App: React.FC = () => {
  const [code, setCode] = useState(SAMPLE_CODE_SEQUENTIAL);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [simState, setSimState] = useState<SimulationState | null>(null);
  const [labels, setLabels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [isRunning, setIsRunning] = useState(false); // New flag to track if simulation technically started

  // Initialize immediately on mount
  useEffect(() => {
    resetAndInit(code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetAndInit = (sourceCode: string) => {
    try {
      const { instructions, labels: parsedLabels } = parseAssembly(sourceCode);
      const initialRegs = INITIAL_REGISTERS.reduce((acc, name) => {
        acc[name] = 0;
        // Set some defaults just for specific registers based on generic examples
        if (name === "F2") acc[name] = 1.33;
        return acc;
      }, {} as Record<string, number>);

      const initialState = initializeState(instructions, config, initialRegs);
      setLabels(parsedLabels);
      setSimState(initialState);
      setError(null);
      setIsRunning(false);
    } catch (e) {
      setError("Failed to parse assembly code.");
    }
  };

  const handleUpdateRegister = (name: string, value: number) => {
    if (simState && simState.cycle === 0) {
      setSimState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          registers: {
            ...prev.registers,
            [name]: { ...prev.registers[name], value },
          },
        };
      });
    }
  };

  const startSimulation = () => {
    setIsRunning(true);
  };

  const handleNextCycle = () => {
    if (simState && !simState.isFinished) {
      if (!isRunning) setIsRunning(true);
      setSimState(nextCycle(simState, config, labels));
    }
  };

  const handleReset = () => {
    resetAndInit(code);
  };

  const updateLatency = (op: string, val: number) => {
    setConfig((prev) => ({
      ...prev,
      latencies: { ...prev.latencies, [op]: val },
    }));
  };

  const updateCache = (field: string, val: number) => {
    setConfig((prev) => ({
      ...prev,
      cache: { ...prev.cache, [field]: val },
    }));
  };

  // Auto-scroll log
  useEffect(() => {
    const el = document.getElementById("log-end");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, [simState?.log]);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700 shadow-md z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            Tomasulo Simulator
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          {simState && (
            <div className="px-4 py-1 bg-gray-700 rounded-full border border-gray-600 font-mono text-blue-300">
              Cycle: {simState.cycle} | PC: {simState.pc}
            </div>
          )}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-2 rounded hover:bg-gray-700 transition ${
              showConfig ? "bg-gray-700 text-blue-400" : "text-gray-400"
            }`}
            title="Configuration"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Editor & Controls */}
        <div className="w-96 flex flex-col border-r border-gray-700 bg-gray-900 z-10 shadow-xl">
          {showConfig ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <h2 className="text-lg font-bold text-gray-300 border-b border-gray-700 pb-2">
                Configuration
              </h2>

              {/* Latencies */}
              <div className="space-y-3">
                <h3 className="text-sm uppercase text-gray-500 font-bold">
                  Latencies (Cycles)
                </h3>
                {Object.keys(config.latencies).map((op) => (
                  <div key={op} className="flex justify-between items-center">
                    <label className="text-sm text-gray-400 w-24">{op}</label>
                    <input
                      type="number"
                      min="1"
                      className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-right"
                      value={config.latencies[op as OpType]}
                      onChange={(e) =>
                        updateLatency(op, parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                ))}
              </div>

              {/* Cache */}
              <div className="space-y-3">
                <h3 className="text-sm uppercase text-gray-500 font-bold">
                  Cache
                </h3>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-400">Block Size</label>
                  <input
                    type="number"
                    className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-right"
                    value={config.cache.blockSize}
                    onChange={(e) =>
                      updateCache("blockSize", parseInt(e.target.value) || 4)
                    }
                  />
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-400">Cache Size</label>
                  <input
                    type="number"
                    className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-right"
                    value={config.cache.cacheSize}
                    onChange={(e) =>
                      updateCache("cacheSize", parseInt(e.target.value) || 16)
                    }
                  />
                </div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-400">Miss Penalty</label>
                  <input
                    type="number"
                    className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-right"
                    value={config.cache.missPenalty}
                    onChange={(e) =>
                      updateCache("missPenalty", parseInt(e.target.value) || 10)
                    }
                  />
                </div>
              </div>

              <button
                onClick={() => setShowConfig(false)}
                className="w-full py-2 bg-blue-700 hover:bg-blue-600 rounded text-sm font-bold"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 flex flex-col p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-300">
                    Assembly Code
                  </h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setCode(SAMPLE_CODE_SEQUENTIAL);
                        resetAndInit(SAMPLE_CODE_SEQUENTIAL);
                      }}
                      className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-400"
                    >
                      Seq
                    </button>
                    <button
                      onClick={() => {
                        setCode(SAMPLE_CODE_LOOP);
                        resetAndInit(SAMPLE_CODE_LOOP);
                      }}
                      className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-400"
                    >
                      Loop
                    </button>
                  </div>
                </div>
                <textarea
                  className="flex-1 bg-gray-800 text-gray-300 font-mono text-sm p-3 rounded border border-gray-700 resize-none focus:outline-none focus:border-blue-500"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    // Try to live parse/init
                    try {
                      const { instructions, labels: parsedLabels } =
                        parseAssembly(e.target.value);
                      const initRegs = simState
                        ? simState.registers
                        : INITIAL_REGISTERS.reduce((acc, name) => {
                            acc[name] = 0;
                            return acc;
                          }, {} as any);
                      // Maintain existing reg values if possible
                      const values = Object.keys(initRegs).reduce(
                        (acc, key) => {
                          acc[key] =
                            typeof initRegs[key] === "number"
                              ? initRegs[key]
                              : (initRegs[key] as any).value || 0;
                          return acc;
                        },
                        {} as any
                      );
                      const newState = initializeState(
                        instructions,
                        config,
                        values
                      );
                      setLabels(parsedLabels);
                      setSimState(newState);
                      setError(null);
                      setIsRunning(false);
                    } catch (err) {
                      // Ignore parse errors while typing
                    }
                  }}
                />
                {error && (
                  <div className="text-red-400 text-xs px-2">{error}</div>
                )}
              </div>

              <div className="p-4 border-t border-gray-700 bg-gray-800">
                <div className="flex space-x-2">
                  <button
                    onClick={handleNextCycle}
                    disabled={simState?.isFinished}
                    className={`flex-1 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded transition-all ${
                      simState?.isFinished
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {isRunning ? (
                      <SkipForward className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                    <span>{isRunning ? "Next Cycle" : "Start Simulation"}</span>
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition-all"
                    title="Reset"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Panel: Visualization */}
        <div className="flex-1 bg-gray-900 p-6 overflow-hidden relative">
          {simState ? (
            <SimulationView
              state={simState}
              onUpdateRegister={handleUpdateRegister}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg">Parsing code...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
