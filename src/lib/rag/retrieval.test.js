const { sourceFamilyOf, capBySourceFamily } = require('./retrieval');

const isupport = (id) => ({ id, tags: [`document_id:isupport-nz`, 'chunk_level:child'] });
const isupportWho = (id) => ({ id, tags: [`document_id:isupport-who`] });
const curated = (id) => ({ id, tags: ['caregiving', 'routine'] });
const otherDoc = (id) => ({ id, tags: ['document_id:nzguide'] });

describe('sourceFamilyOf', () => {
  it('collapses all isupport document ids into one family', () => {
    expect(sourceFamilyOf(isupport('a'))).toBe('isupport');
    expect(sourceFamilyOf(isupportWho('b'))).toBe('isupport');
  });

  it('uses the document id for other bulk sources', () => {
    expect(sourceFamilyOf(otherDoc('c'))).toBe('nzguide');
  });

  it('falls back to curated when no document_id tag exists', () => {
    expect(sourceFamilyOf(curated('d'))).toBe('curated');
    expect(sourceFamilyOf({ id: 'e' })).toBe('curated');
  });
});

describe('capBySourceFamily', () => {
  it('caps the isupport family at maxPerFamily within top-k', () => {
    const rows = [isupport('i1'), isupport('i2'), isupport('i3'), curated('c1'), curated('c2'), curated('c3')];
    const out = capBySourceFamily(rows, 5, 2);
    expect(out.map(r => r.id)).toEqual(['i1', 'i2', 'c1', 'c2', 'c3']);
  });

  it('preserves similarity order for admitted rows', () => {
    const rows = [curated('c1'), isupport('i1'), curated('c2'), isupport('i2'), isupport('i3'), curated('c3')];
    const out = capBySourceFamily(rows, 5, 2);
    expect(out.map(r => r.id)).toEqual(['c1', 'i1', 'c2', 'i2', 'c3']);
  });

  it('does not cap non-isupport families (current intentional behaviour)', () => {
    const rows = [curated('c1'), curated('c2'), curated('c3'), curated('c4'), curated('c5')];
    expect(capBySourceFamily(rows, 5, 2)).toHaveLength(5);
  });

  it('returns fewer than k when candidates run out', () => {
    const rows = [isupport('i1'), isupport('i2'), isupport('i3')];
    expect(capBySourceFamily(rows, 5, 2).map(r => r.id)).toEqual(['i1', 'i2']);
  });

  it('handles empty input', () => {
    expect(capBySourceFamily([], 5, 2)).toEqual([]);
  });
});
