import { useEffect, useState, useRef } from 'react';

type Competitor = {
  firstName: string;
  lastName: string;
  lane: number;
  color: string;
  timeSeconds?: number;
  rank?: number;
};

type RacePhase = 'registration' | 'semaphore' | 'racing' | 'finished';

const LANE_COLORS = [
  '#ef4444', // Rojo (Pista 1)
  '#3b82f6', // Azul (Pista 2)
  '#10b981', // Verde (Pista 3)
  '#f59e0b', // Amarillo (Pista 4)
  '#8b5cf6', // Violeta (Pista 5)
];


export default function App() {
  const [phase, setPhase] = useState<RacePhase>('registration');
  const [arduinoConnected, setArduinoConnected] = useState(false);
  const [semaphoreStage, setSemaphoreStage] = useState(0);
  const [raceElapsedMs, setRaceElapsedMs] = useState(0);

  const [competitors, setCompetitors] = useState<Competitor[]>([
    { firstName: 'Competidor', lastName: '1', lane: 1, color: LANE_COLORS[0] ?? '#ef4444' },
    { firstName: 'Competidor', lastName: '2', lane: 2, color: LANE_COLORS[1] ?? '#3b82f6' },
  ]);

  const timerRef = useRef<number | null>(null);
  const raceStartTimestampRef = useRef<number>(0);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('http://localhost:3000/api/serial/events');

      eventSource.onopen = () => {
        setArduinoConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: { message: string } = JSON.parse(event.data);
          const raw = data.message.trim();
          handleArduinoMessage(raw);
        } catch {
        }
      };

      eventSource.onerror = () => {
        setArduinoConnected(false);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleArduinoMessage = (message: string) => {
    console.log('[Arduino Event]', message);

    if (message.includes('STATUS:ARDUINO_CONNECTED')) {
      setArduinoConnected(true);
      return;
    }
    if (message.includes('STATUS:ARDUINO_DISCONNECTED')) {
      setArduinoConnected(false);
      return;
    }

    if (message === 'STATUS:SEMAFORO') {
      setPhase('semaphore');
      setSemaphoreStage(1);

      const intv = setInterval(() => {
        setSemaphoreStage((prev) => {
          if (prev >= 4) {
            clearInterval(intv);
            return 4;
          }
          return prev + 1;
        });
      }, 1200);
      return;
    }

    if (message === 'STATUS:GO') {
      setPhase('racing');
      setSemaphoreStage(4);
      raceStartTimestampRef.current = Date.now();

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setRaceElapsedMs(Date.now() - raceStartTimestampRef.current);
      }, 30);
      return;
    }

    const autoMatch = /^Auto (\d+):\s*([\d.]+)\s*s/.exec(message);
    if (autoMatch && autoMatch[1] && autoMatch[2]) {
      const laneNum = parseInt(autoMatch[1], 10);
      const timeSec = parseFloat(autoMatch[2]);

      setCompetitors((prev) => {
        const competitor = prev.find((c) => c.lane === laneNum);
        if (!competitor) {
          return prev;
        }

        if (competitor.timeSeconds !== undefined) {
          return prev;
        }
        const finishedCount = prev.filter((c) => c.timeSeconds !== undefined).length;
        const currentRank = finishedCount + 1;

        return prev.map((comp) => {
          if (comp.lane === laneNum) {
            return {
              ...comp,
              timeSeconds: timeSec,
              rank: currentRank,
            };
          }
          return comp;
        });
      });
      return;
    }

    if (message === 'STATUS:FINISHED') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setPhase('finished');
      return;
    }

    if (message === 'STATUS:STOPPED' || message === 'STATUS:READY') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Manejadores para inscripción de competidores
  const handleInputChange = (index: number, field: keyof Competitor, value: string) => {
    const updated = [...competitors];
    const target = updated[index];
    if (target) {
      updated[index] = { ...target, [field]: value };
      setCompetitors(updated);
    }
  };

  const MAX_LANES = 5;

  const addLane = () => {
    if (competitors.length < MAX_LANES) {
      const nextLane = competitors.length + 1;
      const color = LANE_COLORS[nextLane - 1] ?? '#3b82f6';
      setCompetitors([
        ...competitors,
        {
          firstName: '',
          lastName: '',
          lane: nextLane,
          color,
        },
      ]);
    }
  };

  const removeLane = (laneNumber: number) => {
    if (competitors.length <= 1) return;
    setCompetitors(
      competitors
        .filter((c) => c.lane !== laneNumber)
        .map((c, i) => ({
          ...c,
          lane: i + 1,
          color: LANE_COLORS[i] ?? '#3b82f6',
        }))
    );
  };

  // Iniciar la carrera
  const startRace = async (e: React.FormEvent) => {
    e.preventDefault();

    const validCompetitors = competitors.filter(
      (c) => c.firstName.trim() !== '' && c.lastName.trim() !== ''
    );

    if (validCompetitors.length === 0) {
      alert('Por favor completa al menos un competidor.');
      return;
    }

    // Reset de tiempos y posiciones de los competidores
    const freshCompetitors = validCompetitors.map((c) => ({
      ...c,
      timeSeconds: undefined,
      rank: undefined,
    }));
    setCompetitors(freshCompetitors);
    setRaceElapsedMs(0);
    setSemaphoreStage(0);
    setPhase('semaphore');

    try {
      const response = await fetch('http://localhost:3000/api/race/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitors: freshCompetitors }),
      });

      if (!response.ok) {
        alert('Error al iniciar la carrera en el servidor.');
        setPhase('registration');
      }
    } catch (error) {
      console.error('Error de conexión:', error);
      alert('No se pudo conectar con el servidor backend (puerto 3000).');
      setPhase('registration');
    }
  };

  // Detener la carrera manualmente
  const stopRace = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      await fetch('http://localhost:3000/api/race/stop', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
    setPhase('finished');
  };

  const restartCycle = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setCompetitors((prev) =>
      prev.map((c) => ({
        ...c,
        timeSeconds: undefined,
        rank: undefined,
      }))
    );
    setRaceElapsedMs(0);
    setSemaphoreStage(0);
    setPhase('registration');
  };

  // Formato de cronómetro en pantalla mm:ss.ms
  const formatTime = (ms: number) => {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const millis = Math.floor(ms % 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  const getRankBadge = (rank?: number) => {
    if (!rank) return null;
    switch (rank) {
      case 1:
        return <span className="bg-amber-400 text-amber-950 px-3 py-1 rounded-full font-black text-sm flex items-center gap-1 shadow-md">🥇 1º PUESTO</span>;
      case 2:
        return <span className="bg-slate-300 text-slate-900 px-3 py-1 rounded-full font-black text-sm flex items-center gap-1 shadow-md">🥈 2º PUESTO</span>;
      case 3:
        return <span className="bg-amber-700 text-amber-100 px-3 py-1 rounded-full font-black text-sm flex items-center gap-1 shadow-md">🥉 3º PUESTO</span>;
      default:
        return <span className="bg-slate-700 text-slate-200 px-3 py-1 rounded-full font-bold text-sm">{rank}º Puesto</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 md:p-8 font-sans">
      <header className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏁</span>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-blue-400 via-indigo-300 to-purple-400">
              Circuito de Carreras Arduino
            </h1>
            <p className="text-xs text-slate-400">Semáforo • Barreras Servo • Detección Ultrasónica en Vivo</p>
          </div>
        </div>

        {/* Indicador de estado del puerto Serial / Arduino */}
        <div className="flex items-center gap-2 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800 text-xs font-medium">
          <span className={`w-2.5 h-2.5 rounded-full ${arduinoConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
          <span className={arduinoConnected ? 'text-emerald-300' : 'text-rose-400'}>
            {arduinoConnected ? 'Arduino Conectado (COM5)' : 'Arduino Desconectado'}
          </span>
        </div>
      </header>

      {phase === 'registration' && (
        <main className="w-full max-w-3xl my-auto py-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-white mb-2">Inscripción de Competidores</h2>
            <p className="text-slate-400 text-sm">
              Ingresa los nombres de los pilotos en cada pista. Al presionar Iniciar, se activará el semáforo y se levantarán las barreras.
            </p>
          </div>

          <form onSubmit={startRace} className="bg-slate-900/90 backdrop-blur-md p-6 sm:p-8 rounded-3xl shadow-2xl border border-slate-800 space-y-5">
            <div className="space-y-4">
              {competitors.map((comp, index) => (
                <div
                  key={comp.lane}
                  className="flex flex-col sm:flex-row items-center gap-3 bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 transition hover:border-slate-600 relative overflow-hidden"
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2.5"
                    style={{ backgroundColor: comp.color }}
                  ></div>

                  <div className="pl-3 w-full sm:w-28 flex items-center justify-between sm:justify-start gap-2">
                    <span className="font-extrabold text-lg text-slate-200">
                      Pista {comp.lane}
                    </span>
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 sm:hidden"
                      style={{ backgroundColor: comp.color }}
                    ></span>
                  </div>

                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Nombre"
                      required
                      value={comp.firstName}
                      onChange={(e) => handleInputChange(index, 'firstName', e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder-slate-500"
                    />
                    <input
                      type="text"
                      placeholder="Apellido"
                      required
                      value={comp.lastName}
                      onChange={(e) => handleInputChange(index, 'lastName', e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder-slate-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLane(comp.lane)}
                    disabled={competitors.length <= 1}
                    title="Eliminar carril"
                    className="p-2.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                onClick={addLane}
                disabled={competitors.length >= MAX_LANES}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition border border-slate-700 text-slate-300 flex items-center justify-center gap-2"
              >
                <span>➕</span> Añadir Carril ({competitors.length}/{MAX_LANES})
              </button>

              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-black text-base bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-xl shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
              >
                <span>🏎️</span> Iniciar Carrera
              </button>
            </div>
          </form>
        </main>
      )}

      {/* =========================================================================
          VISTA 2: CARRERA EN VIVO / SEMÁFORO / TIEMPOS
          ========================================================================= */}
      {phase !== 'registration' && (
        <main className="w-full max-w-5xl my-auto py-6 space-y-8">
          {/* Panel central de Estado y Cronómetro */}
          <div className="bg-slate-900/90 backdrop-blur-md p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center text-center">
            {/* Estado según la fase */}
            {phase === 'semaphore' && (
              <div className="space-y-4">
                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                  Semáforo en Cuenta Regresiva
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white">¡Atentos a la largada!</h2>

                {/* Luces del semáforo virtual */}
                <div className="flex items-center justify-center gap-4 py-4">
                  {[1, 2, 3, 4].map((lightNum) => (
                    <div
                      key={lightNum}
                      className={`w-12 h-12 rounded-full border-4 border-slate-800 transition-all duration-300 flex items-center justify-center shadow-lg ${semaphoreStage >= lightNum
                        ? 'bg-rose-500 shadow-rose-500/60 scale-110'
                        : 'bg-slate-800/80 opacity-40'
                        }`}
                    >
                      <div className="w-3 h-3 rounded-full bg-white/40"></div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400">Las barreras se levantarán al finalizar el semáforo...</p>
              </div>
            )}

            {phase === 'racing' && (
              <div className="space-y-3">
                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                  ¡Barreras Arriba! Carrera en Curso
                </span>
                <div className="font-mono text-5xl sm:text-7xl font-black tracking-wider text-transparent bg-clip-text bg-linear-to-r from-emerald-400 via-teal-300 to-cyan-400">
                  {formatTime(raceElapsedMs)}
                </div>
                <p className="text-xs text-slate-400">Esperando detección en los sensores ultrasónicos de meta...</p>
              </div>
            )}

            {phase === 'finished' && (
              <div className="space-y-3">
                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Carrera Concluida
                </span>
                <h2 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-linear-to-r from-amber-300 via-yellow-400 to-amber-500">
                  🏆 ¡Resultados Finales!
                </h2>
                <p className="text-sm text-slate-400">Barreras bajadas en Arduino. Los tiempos oficiales han sido registrados.</p>
              </div>
            )}
          </div>

          {/* Tarjetas de Competidores con Tiempos y Posiciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitors.map((comp) => {
              const isDone = comp.timeSeconds !== undefined;

              return (
                <div
                  key={comp.lane}
                  className={`relative p-5 rounded-2xl border transition-all duration-300 overflow-hidden flex flex-col justify-between ${isDone
                    ? 'bg-slate-900/95 border-emerald-500/50 shadow-xl shadow-emerald-500/10'
                    : 'bg-slate-900/60 border-slate-800'
                    }`}
                >
                  {/* Borde de color de la pista */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2.5"
                    style={{ backgroundColor: comp.color }}
                  ></div>

                  <div className="pl-3 flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                          Pista {comp.lane}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: comp.color }}
                        ></span>
                      </div>
                      <h3 className="text-xl font-black text-white">
                        {comp.firstName} {comp.lastName}
                      </h3>
                    </div>

                    <div>
                      {isDone ? (
                        getRankBadge(comp.rank)
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-blue-400"></span> En pista
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tiempo exacto */}
                  <div className="pl-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Tiempo en meta:</span>
                    <span
                      className={`font-mono text-2xl font-black ${isDone ? 'text-emerald-400' : 'text-slate-600'
                        }`}
                    >
                      {isDone ? `${comp.timeSeconds?.toFixed(3)} s` : '--.--- s'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            {phase === 'racing' && (
              <button
                type="button"
                onClick={stopRace}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm bg-rose-600/90 hover:bg-rose-500 text-white transition shadow-lg shadow-rose-600/20"
              >
                ⏹️ Detener / Cancelar Carrera
              </button>
            )}

            {(phase === 'finished' || phase === 'semaphore') && (
              <button
                type="button"
                onClick={restartCycle}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl font-black text-base bg-linear-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-xl shadow-indigo-500/25 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
              >
                <span>🔄</span> Iniciar Nueva Carrera (Reiniciar Ciclo)
              </button>
            )}
          </div>
        </main>
      )}

      <footer className="w-full max-w-5xl pt-6 border-t border-slate-900 text-center text-xs text-slate-500">
        Control de Pista Arduino • Flujo Cíclico Automatizado
      </footer>
    </div>
  );
}
