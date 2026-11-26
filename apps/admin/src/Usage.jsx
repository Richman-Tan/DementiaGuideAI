// What the live assistant has been doing: turns a day, how they ended, how
// long people waited for the first word, and what it cost. It reads the
// summary of the turn traces (apps/api/src/trace.ts), which hold what the
// system did and never what was said, so nothing here is anyone's question.
import { useEffect, useState } from 'react';
import { budgetLine, fetchUsage, seconds, share, shortDay, usd } from './lib/usage.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const RANGES = [7, 14, 30, 90];

export default function Usage({ accessToken }) {
  const [days, setDays] = useState(14);
  // The last answer from the API, and which range it was for. While that is
  // not the range now chosen, the page is loading.
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsage({ apiBaseUrl: API_BASE_URL, accessToken, days }).then(
      (report) => !cancelled && setResult({ days, report }),
      (err) => !cancelled && setResult({ days, error: err.message })
    );
    return () => {
      cancelled = true;
    };
  }, [accessToken, days]);

  const current = result?.days === days ? result : null;

  return (
    <section>
      <div className="range">
        <label htmlFor="usage-days">Show the last</label>
        <select id="usage-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {RANGES.map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </select>
      </div>

      {!current && <p>Loading…</p>}
      {current?.error && <p className="error">{current.error}</p>}
      {current?.report && <Report report={current.report} />}
    </section>
  );
}

function Report({ report }) {
  const { totals, lines, today } = report;
  const budget = budgetLine(today);
  return (
    <>
      {budget && <p className="budget">{budget}</p>}
      <dl className="totals">
        <div>
          <dt>Turns</dt>
          <dd>{totals.turns}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{share(totals.failed, totals.turns)}</dd>
        </div>
        <div>
          <dt>Interrupted</dt>
          <dd>{share(totals.interrupted, totals.turns)}</dd>
        </div>
        <div>
          <dt>Found no passage</dt>
          <dd>{share(totals.withoutPassages, totals.turns)}</dd>
        </div>
        <div>
          <dt>Emergencies</dt>
          <dd>{totals.emergencies}</dd>
        </div>
        <div>
          <dt>Estimated cost</dt>
          <dd>{usd(totals.estimatedCostUsd)}</dd>
        </div>
      </dl>

      {lines.length === 0 ? (
        <p>No turns in these days.</p>
      ) : (
        <div className="scroll">
          <table>
            <caption>
              One line for each day, kind of turn, model and pipeline version. Days are UTC days.
            </caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Kind</th>
                <th scope="col">Model</th>
                <th scope="col" className="num">
                  Turns
                </th>
                <th scope="col" className="num">
                  Failed
                </th>
                <th scope="col" className="num">
                  Interrupted
                </th>
                <th scope="col" className="num">
                  No passage
                </th>
                <th scope="col" className="num">
                  First word, median
                </th>
                <th scope="col" className="num">
                  First word, 95th
                </th>
                <th scope="col" className="num">
                  Est. cost
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={`${line.day} ${line.modality} ${line.model} ${line.pipelineVersion}`}>
                  <th scope="row">{shortDay(line.day)}</th>
                  <td>{line.modality === 'voice' ? 'Spoken' : 'Written'}</td>
                  <td title={`pipeline ${line.pipelineVersion}`}>{line.model ?? '—'}</td>
                  <td className="num">{line.turns}</td>
                  <td className="num">{line.failed}</td>
                  <td className="num">{line.interrupted}</td>
                  <td className="num">{line.withoutPassages}</td>
                  <td className="num">{seconds(line.firstWordP50Ms)}</td>
                  <td className="num">{seconds(line.firstWordP95Ms)}</td>
                  <td className="num">{usd(line.estimatedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="note">
        Costs are tokens at Anthropic's list prices as checked on {report.pricesAsOf}: an estimate,
        not the bill. Speech is not included. These figures come from a record of what the system
        did on each turn; it holds no question, no answer and no account.
      </p>
    </>
  );
}
