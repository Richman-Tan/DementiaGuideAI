#!/usr/bin/env python3
"""Post-hoc dependence/position audit of the existing E6 responses; no API calls.

Private CSVs and the blinded stimulus key stay outside the repository. The exact
participant selection is inherited from the frozen final E6 aggregate. Outputs
contain aggregate statistics only. Usage: python reanalyse-e6.py --data DIR
--key FILE --out FILE. Two-way percentile bootstrap resamples raters and the ten
shared sentences independently (crossed design); its scope is this convenience
sample, not the population of carers. No new confirmatory hypothesis is claimed.
"""
import argparse
import csv
import hashlib
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data', type=Path, required=True)
    p.add_argument('--key', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    args = p.parse_args()
    original_path = ROOT / 'docs/report/eval/e6/e6-results_FINAL-2026-10-10_n15.json'
    original = json.loads(original_path.read_text())
    key = json.loads(args.key.read_text())
    clips = key['clips']
    raters = original['raters']
    rows, hashes = [], {}
    for filename in original['files']:
        path = args.data / filename
        hashes[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
        for row in csv.DictReader(path.open()):
            if row['participant_code'] in raters and row['pair_role'] == 'main':
                assert row['session_complete'] == 'yes'
                assert row['took_part_in_study'] == 'no'
                assert row['stimuli_id'] == original['stimuliId']
                row['engine_chosen'] = clips[row['chosen_clip']]['condition'] == 'engine'
                row['engine_left'] = clips[row['clip_left']]['condition'] == 'engine'
                rows.append(row)
    pairs = sorted({r['pair_id'] for r in rows})
    assert len(rows) == 150 and len(pairs) == 10 and len(raters) == 15
    assert len({(r['participant_code'], r['pair_id']) for r in rows}) == 150
    matrix = np.array([[int(next(r for r in rows if r['participant_code'] == who
                         and r['pair_id'] == pair)['engine_chosen'])
                         for pair in pairs] for who in raters])
    assert int(matrix.sum()) == original['preference']['k'] == 107
    assert np.allclose(matrix.mean(axis=1),
                       [x['share'] for x in original['preferenceRaterLevel']['per']])
    rng = np.random.default_rng(20261011)
    b = 50000
    r_idx = rng.integers(0, 15, size=(b, 15))
    s_idx = rng.integers(0, 10, size=(b, 10))
    two_way = matrix[r_idx[:, :, None], s_idx[:, None, :]].mean(axis=(1, 2))
    rater_only = matrix.mean(axis=1)[r_idx].mean(axis=1)
    pvals = {'preference_majority': original['preferenceRaterLevel']['p'],
             'synchronisation': original['sync']['wilcoxon']['p'],
             'naturalness': original['naturalness']['wilcoxon']['p']}
    adjusted, previous = {}, 0.0
    for i, (name, value) in enumerate(sorted(pvals.items(), key=lambda x: x[1])):
        previous = max(previous, min(1.0, (3-i)*value))
        adjusted[name] = previous
    day_by_rater = {}
    for row in rows:
        day = datetime.fromisoformat(row['trial_started_at'].replace('Z', '+00:00')).astimezone(ZoneInfo('Pacific/Auckland')).day
        who = row['participant_code']
        assert who not in day_by_rater or day_by_rater[who] == day
        day_by_rater[who] = day
    assert set(day_by_rater.values()) == {9, 10}
    groups = [(f'{day} October', [who for who in raters if day_by_rater[who] == day]) for day in (9, 10)]
    position = {}
    for day, ids in groups + [('all', raters)]:
        rr = [r for r in rows if r['participant_code'] in ids]
        position[day] = {'raters': len(ids), 'trials': len(rr),
                         'engine_choices': sum(r['engine_chosen'] for r in rr),
                         'left_choices': sum(r['choice'] == 'left' for r in rr),
                         'engine_left_trials': sum(r['engine_left'] for r in rr),
                         'engine_choices_when_left': sum(r['engine_chosen'] and r['engine_left'] for r in rr),
                         'engine_right_trials': sum(not r['engine_left'] for r in rr),
                         'engine_choices_when_right': sum(r['engine_chosen'] and not r['engine_left'] for r in rr),
                         'rater_share_range': [float(matrix[[raters.index(x) for x in ids]].mean(axis=1).min()),
                                               float(matrix[[raters.index(x) for x in ids]].mean(axis=1).max())]}
    result = {'status': 'post hoc reanalysis, 11 October 2026', 'seed': 20261011,
              'bootstrap_replicates': b, 'raters': 15, 'sentences': 10, 'choices': 150,
              'engine_choices': 107, 'mean_preference': float(matrix.mean()),
              'two_way_percentile_95ci': np.quantile(two_way, [.025, .975]).tolist(),
              'rater_percentile_95ci': np.quantile(rater_only, [.025, .975]).tolist(),
              'p_raw': pvals, 'p_holm_rater_tests': adjusted, 'position': position,
              'input_sha256': hashes, 'key_sha256': hashlib.sha256(args.key.read_bytes()).hexdigest(), 'aggregate_sha256': hashlib.sha256(original_path.read_bytes()).hexdigest(),
              'limitations': 'Post hoc; convenience sample; only ten fixed sentences; day and cohort confounded. Bootstrap resamples observed raters and sentences and does not remove recruitment bias.'}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k:v for k,v in result.items() if not k.endswith('sha256')}, indent=2))


if __name__ == '__main__':
    main()
