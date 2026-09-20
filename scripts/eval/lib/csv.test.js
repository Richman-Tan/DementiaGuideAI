const { parseCsv, toCsv } = require('./csv');

describe('csv', () => {
  it('round-trips quoted fields with commas, quotes and newlines', () => {
    const rows = [{ id: 'A1', answer: 'Call 111, then "stay calm".\nSecond line', score: 2 }, { id: 'A2', answer: '', score: '' }];
    const text = toCsv(rows, ['id', 'answer', 'score']);
    const back = parseCsv(text);
    expect(back).toEqual([{ id: 'A1', answer: 'Call 111, then "stay calm".\nSecond line', score: '2' }, { id: 'A2', answer: '', score: '' }]);
  });
  it('handles CRLF and a missing trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });
});
