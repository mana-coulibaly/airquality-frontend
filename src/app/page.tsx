'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts';

type Stat = { min: number; max: number; mean: number };
type Config = {
  W_columns: string[];
  T_name: string;
  stats: Record<string, Stat>;
  class_labels: string[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'https://airquality-app.onrender.com';

type PredictPayload = { W: Record<string, number>; T: number };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function Home() {
  // -------------------- HOOKS (top-level, ordre fixe) --------------------
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);

  // Entrées utilisateur
  const [W, setW] = useState<Record<string, number>>({});
  const [T, setT] = useState<number>(0);
  const [whatIfPct, setWhatIfPct] = useState<number>(-20);

  // Résultats
  const [probaCur, setProbaCur] = useState<number[] | null>(null);
  const [probaCf, setProbaCf] = useState<number[] | null>(null);
  const [cate, setCate] = useState<number | null>(null);
  const [yHat, setYHat] = useState<number | null>(null);
  const [resultMode, setResultMode] = useState<'prediction' | 'simulation' | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Erreurs réseau
  const [err, setErr] = useState<string | null>(null);

  //Légende bon, moyen, mauvais
  // juste après const labels = cfg?.class_labels ?? ['0', '1', '2'];
const legendMapping: Record<string, string> = {
  "0": "Bon",
  "1": "Mauvais",
  "2": "Moyen",
};

  const variableInfo: Record<string, { name: string; description: string }> = {
  X0: { name: 'Monoxyde de carbone', description: 'Gaz issu principalement de la combustion.' },
  X1: { name: 'Benzène', description: 'Composé volatil présent dans certains carburants.' },
  X2: { name: 'Indicateur chimique', description: 'Mesure chimique relevée dans l’environnement.' },
  X3: { name: 'Température', description: 'Température au moment de la mesure.' },
  X4: { name: 'Humidité relative', description: 'Quantité de vapeur d’eau dans l’air.' },
  X5: { name: 'Polluant atmosphérique 1', description: 'Mesure issue des capteurs de qualité de l’air.' },
  X6: { name: 'Polluant atmosphérique 2', description: 'Mesure complémentaire de particules ou de gaz.' },
  X7: { name: 'Polluant atmosphérique 3', description: 'Indicateur de pollution atmosphérique.' },
  X8: { name: 'Polluant atmosphérique 4', description: 'Mesure complémentaire provenant des capteurs.' },
  X9: { name: 'Humidité absolue', description: 'Quantité réelle de vapeur d’eau dans l’air.' },
  X10: { name: 'Composé organique volatil', description: 'Famille de substances présentes dans l’air.' },
  X11: { name: 'Indicateur temporel', description: 'Information liée au moment de l’observation.' },
};

const classExplanations: Record<string, string> = {
  Bon: 'Le modèle estime que les conditions observées correspondent à une qualité de l’air favorable.',
  Mauvais: 'Le modèle détecte un niveau de pollution préoccupant dans les conditions observées.',
  Moyen: 'Le modèle estime une situation intermédiaire : certains indicateurs restent acceptables, mais une vigilance est recommandée.',
};


  // -------------------- CHARGEMENT CONFIG --------------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingCfg(true);
        const r = await fetch(`${API_BASE}/config`);
        if (!r.ok) throw new Error(`/config HTTP ${r.status}`);
        const c: Config = await r.json();
        if (!mounted) return;

        setCfg(c);

        // initialise W & T à leurs moyennes
        const w0: Record<string, number> = {};
        c.W_columns.forEach((k) => (w0[k] = c.stats[k].mean));
        setW(w0);
        setT(c.stats[c.T_name].mean);

        setErr(null);
      } catch (e: unknown) {
        setErr(errorMessage(e, 'Erreur de config'));
      } finally {
        if (mounted) setLoadingCfg(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('air-quality-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('air-quality-theme', next);
      return next;
    });
  }

  // -------------------- ACTIONS --------------------
  async function callPredict() {
    if (!cfg) return;
    try {
      const payload: PredictPayload = { W, T };
      const r = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`/predict HTTP ${r.status}`);
      const data = await r.json();
      // backend (version classifier) renvoie: class_pred, proba, cate, ...
      setProbaCur(data.proba ?? null);
      setCate(typeof data.cate === 'number' ? data.cate : null);
      // y_hat: on peut approximer par proba argmax si besoin
      setYHat(
        Array.isArray(data.proba)
          ? data.proba.indexOf(Math.max(...data.proba))
          : null
      );
      setProbaCf(null);
      setResultMode('prediction');
      setErr(null);
    } catch (e: unknown) {
      setErr(errorMessage(e, 'Erreur /predict'));
    }
  }

  async function callWhatIf() {
    if (!cfg) return;
    try {
      const payload: PredictPayload = { W, T };
      const r = await fetch(`${API_BASE}/whatif?pct=${whatIfPct}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`/whatif HTTP ${r.status}`);
      const data = await r.json();

      // current
      if (Array.isArray(data.current?.proba)) {
        setProbaCur(data.current.proba);
      }
      if (typeof data.current?.cate === 'number') {
        setCate(data.current.cate);
      }

      // counterfactual
      setProbaCf(
        Array.isArray(data.counterfactual?.proba)
          ? data.counterfactual.proba
          : null
      );
      setYHat(
        Array.isArray(data.current?.proba)
          ? data.current.proba.indexOf(Math.max(...data.current.proba))
          : null
      );
      setResultMode('simulation');

      setErr(null);
    } catch (e: unknown) {
      setErr(errorMessage(e, 'Erreur /whatif'));
    }
  }

  // -------------------- DERIVÉS (memo) --------------------
  const labels = useMemo(() => cfg?.class_labels ?? ['0', '1', '2'], [cfg?.class_labels]);
  const confidence = probaCur ? Math.max(...probaCur) * 100 : null;
  const counterfactualClass = probaCf
    ? probaCf.indexOf(Math.max(...probaCf))
    : null;
  const counterfactualConfidence = probaCf
    ? Math.max(...probaCf) * 100
    : null;
  const chartData = useMemo(() => {
    // ⚠ retourne toujours une valeur (jamais de hook conditionnel)
    const cur = probaCur ?? [];
    const cf = probaCf ?? [];
    const rows: { label: string; courant?: number; contrefactuel?: number }[] =
      [];

    const n = Math.max(labels.length, cur.length, cf.length);
    for (let i = 0; i < n; i++) {
      rows.push({
        label: labels[i] ?? `C${i}`,
        courant: cur[i],
        contrefactuel: cf[i],
      });
    }
    return rows;
  }, [labels, probaCur, probaCf]);

  // -------------------- UI --------------------
  if (loadingCfg) return <main>Chargement config…</main>;
  if (!cfg) return <main>Impossible de charger la configuration.</main>;

  return (
    <main className={`${theme === 'light' ? 'theme-light' : 'theme-dark'} min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-10`}>
      <div className="mx-auto max-w-7xl space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-blue-950 to-cyan-950 p-6 shadow-2xl sm:p-10">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-2 shadow-lg shadow-cyan-950/40">
            <svg viewBox="0 0 64 64" aria-hidden="true" className="h-full w-full">
              <circle cx="32" cy="32" r="23" fill="#22d3ee" opacity=".18" />
              <path d="M17 43 27 21h7l11 22h-7l-2.2-5H26l-2 5Zm11-11h5l-2.5-6Z" fill="#ecfeff" />
              <path d="M14 49c6-4 12-5 18-3 7 2 12 1 18-3" fill="none" stroke="#67e8f9" strokeLinecap="round" strokeWidth="3" />
            </svg>
          </div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-white">Air Quality Analysis</p>
          </div>
          <button type="button" onClick={toggleTheme} className="theme-toggle rounded-full border border-cyan-200/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20" aria-label="Changer de thème">
            {theme === 'dark' ? '☀️ Thème clair' : '🌙 Thème sombre'}
          </button>
        </div>
        <p className="relative text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">AirQualityUCI · analyse environnementale</p>
        <h1 className="relative mt-3 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-5xl">Comprendre l’impact de la pollution sur l’air que nous respirons.</h1>
        <p className="relative mt-4 max-w-2xl text-base leading-7 text-blue-100">Ajustez les paramètres, obtenez une estimation et explorez un scénario de réduction du NO₂ grâce à un modèle d’apprentissage automatique et causal.</p>
        <div className="relative mt-6 flex flex-wrap gap-3 text-sm text-cyan-100"><span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1">Simulation interactive</span><span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1">Données environnementales</span></div>
      </header>

      <section className="rounded-2xl border border-blue-900/60 bg-slate-900 p-5 text-slate-200 shadow-xl sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
              Comment fonctionne cette application ?
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Explorer l&apos;effet du NO&#8322; sur la qualit&eacute; de l&apos;air
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Le dashboard utilise des donn&eacute;es environnementales pour estimer une
              classe de qualit&eacute; de l&apos;air et comparer un sc&eacute;nario courant &agrave; un
              sc&eacute;nario modifi&eacute;. Les curseurs permettent de tester une situation
              sans modifier les donn&eacute;es originales.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-300 lg:max-w-xs">
            <p className="font-semibold text-white">Source des donn&eacute;es</p>
            <p className="mt-1">
              AirQualityUCI, jeu de donn&eacute;es disponible sur Kaggle. Les valeurs
              affich&eacute;es ici sont des variables pr&eacute;par&eacute;es pour le mod&egrave;le.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="font-semibold text-white">1. Contexte (W)</p>
            <p className="mt-1 text-sm leading-5 text-slate-300">
              Les variables X0 &agrave; X11 d&eacute;crivent le contexte environnemental de
              l&apos;observation.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="font-semibold text-white">2. Traitement (T)</p>
            <p className="mt-1 text-sm leading-5 text-slate-300">
              Le curseur NO&#8322; repr&eacute;sente le param&egrave;tre dont on veut &eacute;tudier
              l&apos;influence.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="font-semibold text-white">3. Analyse</p>
            <p className="mt-1 text-sm leading-5 text-slate-300">
              <strong>Pr&eacute;dire</strong> calcule la classe et les probabilit&eacute;s.
              <strong> Simuler</strong> compare un changement de NO&#8322; au sc&eacute;nario
              courant.
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-400">
          Les r&eacute;sultats sont des estimations produites par le mod&egrave;le et ne
          remplacent pas une mesure officielle de la qualit&eacute; de l&apos;air.
        </p>
      </section>

      {err && (
        <div className="rounded border border-red-300 bg-red-50 text-red-700 p-3">
          {err}
        </div>
      )}

      {/* Sliders contexte */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
        <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Les conditions observées</p><h2 className="mt-1 text-2xl font-semibold text-white">Contexte environnemental</h2></div><p className="max-w-md text-sm text-slate-400">Chaque variable est expliquée en langage simple. Les valeurs commencent sur la moyenne du jeu de données.</p></div>
        <div className="grid md:grid-cols-2 gap-3">
          {cfg.W_columns.map((k) => {
            const s = cfg.stats[k];
            const v = W[k];
            return (
              <div key={k} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-cyan-400/50">
                <label className="mb-2 flex items-start justify-between gap-3 text-sm font-medium text-slate-200">
                  <span><span className="block text-cyan-300">{variableInfo[k]?.name ?? k}</span><span className="mt-1 block text-xs font-normal leading-5 text-slate-400">{variableInfo[k]?.description ?? 'Variable environnementale utilisée par le modèle.'}</span></span>
                  <span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">{k}</span>
                  <span className="text-xs text-slate-500">
                    (min {s.min.toFixed(1)} | max {s.max.toFixed(1)})
                  </span>
                </label>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step="0.1"
                  value={v}
                  onChange={(e) =>
                    setW((prev) => ({ ...prev, [k]: +e.target.value }))
                  }
                />
                <span className="mt-2 text-right text-sm font-semibold text-white">{v?.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Traitement NO2 */}
      <section className="rounded-2xl border border-cyan-900/70 bg-gradient-to-br from-cyan-950/70 to-slate-900 p-5 shadow-xl sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Le paramètre que l’on fait varier</p><h2 className="mb-2 mt-1 text-2xl font-semibold text-white">Dioxyde d’azote (NO₂)</h2><p className="mb-4 max-w-2xl text-sm leading-6 text-slate-300">Le NO₂ est un polluant atmosphérique. Déplacez le curseur pour observer comment une variation de ce paramètre peut modifier l’estimation du modèle.</p>
        <div className="flex items-center gap-4">
          <input
            className="w-full"
            type="range"
            min={cfg.stats[cfg.T_name].min}
            max={cfg.stats[cfg.T_name].max}
            step="0.1"
            value={T}
            onChange={(e) => setT(+e.target.value)}
          />
          <span className="text-sm text-gray-600">{T.toFixed(2)}</span>
        </div>
      </section>

      {/* Actions */}
      <section className="flex flex-col items-stretch gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:flex-row sm:items-center sm:p-7">
        <button
          onClick={callPredict}
          className="rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-300"
        >
          Prédire
        </button>

        <div className="flex items-center gap-3">
          <span>What-if (NO₂ %):</span>
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={whatIfPct}
            onChange={(e) => setWhatIfPct(+e.target.value)}
          />
          <span className="w-12 text-right">{whatIfPct}%</span>
        </div>

        <button
          onClick={callWhatIf}
          className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-400/20 transition hover:bg-emerald-300"
        >
          Simuler
        </button>
      </section>

      {/* Résultats */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Lecture du résultat</p><h2 className="mb-4 mt-1 text-2xl font-semibold text-white">Estimation du modèle</h2>
        <div className="text-sm">
          <div>
            Qualité prédite (ŷ) :{" "}
            {yHat !== null
              ? `${legendMapping[String(yHat)] ?? yHat} (classe ${yHat})`
              : "-"}
          </div>

          <div>
            Effet causal marginal (CATE) :{' '}
            {cate !== null ? cate.toFixed(4) : '/'} / unité de NO₂
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
        <h2 className="mb-3 text-xl font-semibold text-white">Légende des classes</h2>
        <ul className="list-disc pl-5 text-sm text-gray-700" style={{listStyleType: 'none'}}>
          <li><b>0</b> = Bon (bonne qualité de l&apos;air)</li>
          <li><b>1</b> = Mauvais (mauvaise qualité de l&apos;air)</li>
          <li><b>2</b> = Moyen (qualité moyenne de l&apos;air)</li>
        </ul>
      </section>


      {resultMode && yHat !== null && (
        <section className="result-explanation rounded-2xl border border-cyan-400/30 bg-cyan-950/40 p-5 shadow-xl sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            {resultMode === 'prediction' ? 'Interprétation de la prédiction' : 'Interprétation de la simulation'}
          </p>
          <div className="mt-1 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Résultat principal : {legendMapping[String(yHat)] ?? yHat}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                {classExplanations[legendMapping[String(yHat)]] ?? 'Le modèle fournit une estimation à interpréter avec les autres indicateurs.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="result-badge rounded-xl border border-cyan-300/30 bg-slate-900/70 px-4 py-3 text-sm">
                {resultMode === 'simulation' ? 'Confiance — courant' : 'Confiance du modèle'} : <strong>{confidence?.toFixed(1)}%</strong>
              </div>
              {resultMode === 'simulation' && (
                <div className="result-badge result-badge-counterfactual rounded-xl border border-orange-300/50 bg-orange-950/40 px-4 py-3 text-sm">
                  Confiance — contrefactuel : <strong>{counterfactualConfidence?.toFixed(1)}%</strong>
                </div>
              )}
            </div>
          </div>
          {resultMode === 'simulation' && counterfactualClass !== null && (
            <p className="mt-4 border-t border-cyan-300/20 pt-4 text-sm leading-6 text-slate-300">
              Avec le scénario contrefactuel de <strong>{whatIfPct}%</strong> sur le NO₂, la classe estimée devient{' '}
              <strong>{legendMapping[String(counterfactualClass)] ?? counterfactualClass}</strong> avec une confiance de{' '}
              <strong>{counterfactualConfidence?.toFixed(1)}%</strong>. Cette comparaison indique une tendance du modèle, et non une mesure réelle.
            </p>
          )}
        </section>
      )}

      {/* Graphiques */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
        <h2 className="mb-3 text-xl font-semibold text-white">Probabilités par classe</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={(v) => legendMapping[v] ?? v} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="courant" name="Courant" fill="#22d3ee" />
              <Bar dataKey="contrefactuel" name="Contrefactuel" fill="#fb923c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
        <h2 className="mb-3 text-xl font-semibold text-white">Courbes courant vs contrefactuel</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="courant" name="Courant" stroke="#22d3ee" strokeWidth={3} dot={{ fill: '#22d3ee', r: 4 }} />
              <Line type="monotone" dataKey="contrefactuel" name="Contrefactuel" stroke="#fb923c" strokeWidth={3} strokeDasharray="6 4" dot={{ fill: '#fb923c', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      </div>
    </main>
  );
}
