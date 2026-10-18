"""Literature-coverage check (12 Oct 2026): the eight OpenAlex searches behind
docs/report/lit-review/openalex-search-2026-10-12.json.

For each strand of the literature review it records the 25 most relevant and the
25 most cited works since 2015, and whether each one's DOI is in the report's
reference list. The report itself is not in the compendium, so pass its reference
list with --refs to fill in_refs; without it in_refs is false throughout.
Results drift as OpenAlex adds works and citations, so a re-run will not match
the committed file exactly.

Usage: python3 scripts/report/openalex-check.py [--refs FILE] [--out FILE]
"""
import argparse,json,time,urllib.parse,urllib.request
from datetime import date
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
ap=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--refs',type=Path,help='reference list to match DOIs against (the report\'s, not included)')
ap.add_argument('--out',type=Path,default=ROOT/f'docs/report/lit-review/openalex-search-{date.today()}.json')
args=ap.parse_args()
refs=args.refs.read_text().lower() if args.refs else ''
Q=[('S1 carers and digital interventions','dementia caregiver information needs online intervention'),
   ('S2 conversational agents in dementia care','chatbot OR "conversational agent" dementia caregivers'),
   ('S3 embodied agents and speech animation','"embodied conversational agent" older adults'),
   ('S3b speech animation','speech animation coarticulation lip sync'),
   ('S4 RAG and attribution in health','"retrieval-augmented generation" medical question answering'),
   ('S5 chatbot safety and jurisdiction','large language model chatbot health advice safety evaluation'),
   ('S6 dementia speech recognition','automatic speech recognition dementia speech word error rate'),
   ('S7 LLM judges and evaluation','"LLM-as-a-judge" agreement human evaluation')]
out=[]
for tag,q in Q:
    base='https://api.openalex.org/works?'
    params={'search':q,'filter':'from_publication_date:2015-01-01,type:article|preprint|proceedings-article|review','per-page':'25','mailto':'noreply@example.com'}
    def get(sort):
        p=dict(params)
        if sort: p['sort']=sort
        return json.load(urllib.request.urlopen(base+urllib.parse.urlencode(p),timeout=60))
    rel=get(None); time.sleep(0.3); cit=get('cited_by_count:desc'); time.sleep(0.3)
    def info(w):
        d=(w.get('doi') or '').lower().replace('https://doi.org/','')
        return {'title':w.get('title'),'year':w.get('publication_year'),'cited':w.get('cited_by_count'),'doi':d,'in_refs': bool(d) and d in refs}
    out.append({'strand':tag,'query':q,'count':rel['meta']['count'],'top_relevance':[info(w) for w in rel['results']],'top_cited':[info(w) for w in cit['results']]})
    print(tag, rel['meta']['count'], 'in-refs(top25 rel):', sum(1 for w in out[-1]['top_relevance'] if w['in_refs']), 'in-refs(top25 cited):', sum(1 for w in out[-1]['top_cited'] if w['in_refs']))
json.dump({'date':str(date.today()),'source':'OpenAlex API','filters':'from 2015, articles/preprints/proceedings/reviews','queries':out},open(args.out,'w'),indent=1)
print('wrote', args.out)
