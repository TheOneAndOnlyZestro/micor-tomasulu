import React from "react";
import { SimulationState, ReservationStation, Register } from "../types";

interface Props {
  state: SimulationState;
}

export const SimulationView: React.FC<Props> = ({ state }) => {
  const addStations = state.reservationStations.filter(
    (rs) => rs.type === "ADD"
  );
  const multStations = state.reservationStations.filter(
    (rs) => rs.type === "MULT"
  );
  const loadBuffers = state.reservationStations.filter(
    (rs) => rs.type === "LOAD"
  );
  const storeBuffers = state.reservationStations.filter(
    (rs) => rs.type === "STORE"
  );

  const renderRSTable = (
    stations: ReservationStation[],
    title: string,
    colorClass: string
  ) => (
    <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
      <h3 className={`text-sm font-bold ${colorClass} mb-2`}>{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left text-gray-300">
          <thead className="text-gray-400 uppercase bg-gray-700">
            <tr>
              <th className="px-2 py-1">Time</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Busy</th>
              <th className="px-2 py-1">Op</th>
              <th className="px-2 py-1">Vj</th>
              <th className="px-2 py-1">Vk</th>
              <th className="px-2 py-1">Qj</th>
              <th className="px-2 py-1">Qk</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((rs) => (
              <tr key={rs.id} className="border-b border-gray-700 font-mono">
                <td className="px-2 py-1 text-yellow-500">
                  {rs.busy ? rs.timeLeft : ""}
                </td>
                <td className="px-2 py-1 font-bold">{rs.id}</td>
                <td
                  className={`px-2 py-1 ${
                    rs.busy ? "text-red-400" : "text-green-400"
                  }`}
                >
                  {rs.busy ? "Yes" : "No"}
                </td>
                <td className="px-2 py-1">{rs.op || "-"}</td>
                <td className="px-2 py-1">
                  {rs.vj !== null ? rs.vj.toFixed(2) : ""}
                </td>
                <td className="px-2 py-1">
                  {rs.vk !== null ? rs.vk.toFixed(2) : ""}
                </td>
                <td className="px-2 py-1 text-blue-300">{rs.qj || ""}</td>
                <td className="px-2 py-1 text-blue-300">{rs.qk || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-full overflow-y-auto pb-20">
      {/* Instruction Queue / Status */}
      <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700 col-span-1 xl:col-span-2">
        <h3 className="text-lg font-bold text-blue-400 mb-2">
          Instruction Status
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="text-xs text-gray-400 uppercase bg-gray-700">
              <tr>
                <th className="px-3 py-2">Inst</th>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Exec Start</th>
                <th className="px-3 py-2">Exec Comp</th>
                <th className="px-3 py-2">Write Result</th>
              </tr>
            </thead>
            <tbody>
              {state.instructions.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b border-gray-700 hover:bg-gray-700/50"
                >
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    {inst.raw}
                  </td>
                  <td className="px-3 py-2">{inst.issueCycle ?? ""}</td>
                  <td className="px-3 py-2">{inst.execStartCycle ?? ""}</td>
                  <td className="px-3 py-2">{inst.execEndCycle ?? ""}</td>
                  <td className="px-3 py-2">{inst.writeCycle ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reservation Stations Area */}
      <div className="col-span-1 xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderRSTable(
          addStations,
          "Reservation Stations (FP Add/Sub)",
          "text-green-400"
        )}
        {renderRSTable(
          multStations,
          "Reservation Stations (FP Mult/Div)",
          "text-green-400"
        )}

        {/* Load Buffers */}
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <h3 className="text-sm font-bold text-yellow-400 mb-2">
            Load Buffers
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-gray-300">
              <thead className="text-gray-400 uppercase bg-gray-700">
                <tr>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Busy</th>
                  <th className="px-2 py-1">Address</th>
                </tr>
              </thead>
              <tbody>
                {loadBuffers.map((rs) => (
                  <tr
                    key={rs.id}
                    className="border-b border-gray-700 font-mono"
                  >
                    <td className="px-2 py-1 font-bold">{rs.id}</td>
                    <td
                      className={`px-2 py-1 ${
                        rs.busy ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {rs.busy ? "Yes" : "No"}
                    </td>
                    {/* For Load, address is typically calculated in 'a' field, or shows offset initially */}
                    <td className="px-2 py-1">
                      {rs.busy ? (rs.a !== null ? rs.a : "") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Store Buffers */}
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <h3 className="text-sm font-bold text-yellow-400 mb-2">
            Store Buffers
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-gray-300">
              <thead className="text-gray-400 uppercase bg-gray-700">
                <tr>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Busy</th>
                  <th className="px-2 py-1">Address</th>
                  <th className="px-2 py-1">V</th>
                  <th className="px-2 py-1">Q</th>
                </tr>
              </thead>
              <tbody>
                {storeBuffers.map((rs) => (
                  <tr
                    key={rs.id}
                    className="border-b border-gray-700 font-mono"
                  >
                    <td className="px-2 py-1 font-bold">{rs.id}</td>
                    <td
                      className={`px-2 py-1 ${
                        rs.busy ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {rs.busy ? "Yes" : "No"}
                    </td>
                    <td className="px-2 py-1">
                      {rs.busy ? (rs.a !== null ? rs.a : "") : ""}
                    </td>
                    {/* For Store, the value to store is usually in Vk/Qk (Source 2/Dest reg) in standard Tomasulo */}
                    <td className="px-2 py-1">
                      {rs.vk !== null ? rs.vk.toFixed(2) : ""}
                    </td>
                    <td className="px-2 py-1 text-blue-300">{rs.qk || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Registers & Cache */}
      <div className="space-y-4 col-span-1 xl:col-span-1">
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-bold text-purple-400 mb-2">
            Register File
          </h3>
          <div className="grid grid-cols-4 gap-2 h-48 overflow-y-auto">
            {Object.values(state.registers).map((reg: Register) => (
              <div
                key={reg.name}
                className="bg-gray-900 p-2 rounded text-xs border border-gray-700"
              >
                <div className="font-bold text-gray-400">{reg.name}</div>
                {reg.qi ? (
                  <div className="text-blue-400 font-bold">Q: {reg.qi}</div>
                ) : (
                  <div
                    className="text-green-400 truncate"
                    title={reg.value.toString()}
                  >
                    V: {reg.value}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 col-span-1 xl:col-span-1">
        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-bold text-orange-400 mb-2">Data Cache</h3>
          <div className="overflow-x-auto h-48">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                <tr>
                  <th className="px-2 py-1">Tag (Block)</th>
                  <th className="px-2 py-1">Valid</th>
                  <th className="px-2 py-1">Last Access</th>
                </tr>
              </thead>
              <tbody>
                {state.cache.map((block, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-700 font-mono text-xs"
                  >
                    <td className="px-2 py-1">{block.tag}</td>
                    <td className="px-2 py-1">{block.valid ? "1" : "0"}</td>
                    <td className="px-2 py-1">{block.lastAccess}</td>
                  </tr>
                ))}
                {state.cache.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-1 text-gray-500 italic">
                      Empty
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Log */}
      <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700 col-span-1 xl:col-span-2">
        <h3 className="text-sm font-bold text-gray-400 mb-2">Event Log</h3>
        <div className="h-32 overflow-y-auto bg-gray-900 p-2 rounded font-mono text-xs text-green-300">
          {state.log.map((entry, i) => (
            <div key={i}>{entry}</div>
          ))}
          <div id="log-end"></div>
        </div>
      </div>
    </div>
  );
};
