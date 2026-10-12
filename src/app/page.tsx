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
  process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

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

  // Erreurs réseau
  const [err, setErr] = useState<string | null>(null);

  //Légende bon, moyen, mauvais
  // juste après const labels = cfg?.class_labels ?? ['0', '1', '2'];
const legendMapping: Record<string, string> = {
  "0": "Bon",
  "1": "Mauvais",
  "2": "Moyen",
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

      setErr(null);
    } catch (e: unknown) {
      setErr(errorMessage(e, 'Erreur /whatif'));
    }
  }

  // -------------------- DERIVÉS (memo) --------------------
  const labels = cfg?.class_labels ?? ['0', '1', '2'];
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
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Air Quality — Simulateur causal</h1>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-slate-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              Comment fonctionne cette application ?
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Explorer l&apos;effet du NO&#8322; sur la qualit&eacute; de l&apos;air
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Le dashboard utilise des donn&eacute;es environnementales pour estimer une
              classe de qualit&eacute; de l&apos;air et comparer un sc&eacute;nario courant &agrave; un
              sc&eacute;nario modifi&eacute;. Les curseurs permettent de tester une situation
              sans modifier les donn&eacute;es originales.
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm text-slate-700 lg:max-w-xs">
            <p className="font-semibold text-slate-900">Source des donn&eacute;es</p>
            <p className="mt-1">
              AirQualityUCI, jeu de donn&eacute;es disponible sur Kaggle. Les valeurs
              affich&eacute;es ici sont des variables pr&eacute;par&eacute;es pour le mod&egrave;le.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-white p-4">
            <p className="font-semibold text-slate-900">1. Contexte (W)</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Les variables X0 &agrave; X11 d&eacute;crivent le contexte environnemental de
              l&apos;observation.
            </p>
          </div>
          <div className="rounded-lg bg-white p-4">
            <p className="font-semibold text-slate-900">2. Traitement (T)</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Le curseur NO&#8322; repr&eacute;sente le param&egrave;tre dont on veut &eacute;tudier
              l&apos;influence.
            </p>
          </div>
          <div className="rounded-lg bg-white p-4">
            <p className="font-semibold text-slate-900">3. Analyse</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              <strong>Pr&eacute;dire</strong> calcule la classe et les probabilit&eacute;s.
              <strong> Simuler</strong> compare un changement de NO&#8322; au sc&eacute;nario
              courant.
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-600">
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
      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-3">Contexte (W)</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {cfg.W_columns.map((k) => {
            const s = cfg.stats[k];
            const v = W[k];
            return (
              <div key={k} className="flex flex-col">
                <label className="text-sm mb-1">
                  {k}{' '}
                  <span className="text-xs text-gray-500">
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
                <span className="text-xs text-gray-500 mt-1">{v?.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Traitement NO2 */}
      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-3">{cfg.T_name} (traitement)</h2>
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
      <section className="rounded-xl border p-4 flex items-center gap-4">
        <button
          onClick={callPredict}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white"
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
          className="px-4 py-2 rounded-lg bg-green-600 text-white"
        >
          Simuler
        </button>
      </section>

      {/* Résultats */}
      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-3">Résultat prédiction</h2>
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

      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-3">Légende des classes</h2>
        <ul className="list-disc pl-5 text-sm text-gray-700" style={{listStyleType: 'none'}}>
          <li><b>0</b> = Bon (bonne qualité de l&apos;air)</li>
          <li><b>1</b> = Mauvais (mauvaise qualité de l&apos;air)</li>
          <li><b>2</b> = Moyen (qualité moyenne de l&apos;air)</li>
        </ul>
      </section>


      {/* Graphiques */}
      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-3">Probabilités par classe</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={(v) => legendMapping[v] ?? v} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="courant" name="Courant" />
              <Bar dataKey="contrefactuel" name="Contrefactuel" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-3">Courbes courant vs contrefactuel</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="courant" name="Courant" />
              <Line type="monotone" dataKey="contrefactuel" name="Contrefactuel" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}
