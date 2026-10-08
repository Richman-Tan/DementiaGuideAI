import { normalizeSpokenText } from './normalizeSpokenText';

// Numbers become words before TTS so the provider's character alignment carries
// real letters the lip-sync can animate. The spoken audio is the same either way.

describe('normalizeSpokenText', () => {
  it('passes empty input straight through', () => {
    expect(normalizeSpokenText('')).toBe('');
    expect(normalizeSpokenText(null)).toBeNull();
    expect(normalizeSpokenText(undefined)).toBeUndefined();
  });

  it('leaves text without numbers or ampersands unchanged', () => {
    expect(normalizeSpokenText('Try a calm, quiet routine.')).toBe('Try a calm, quiet routine.');
  });

  describe('cardinals', () => {
    it.each([
      ['7 days', 'seven days'],
      ['12', 'twelve'],
      ['20', 'twenty'],
      ['23', 'twenty-three'],
      ['100', 'one hundred'],
      ['101', 'one hundred one'],
      ['999', 'nine hundred ninety-nine'],
      ['1,234,567', 'one million two hundred thirty-four thousand five hundred sixty-seven'],
      ['2000000000', 'two billion'],
      // Past the billions the scale table recurses on the head.
      ['1000000000000', 'one thousand billion'],
    ])('%s → %s', (input, spoken) => {
      expect(normalizeSpokenText(input)).toBe(spoken);
    });

    it('reads a leading zero as part of the number, as the provider would', () => {
      expect(normalizeSpokenText('0800')).toBe('eight hundred');
    });

    it('reads decimals digit by digit after "point"', () => {
      expect(normalizeSpokenText('3.14')).toBe('three point one four');
    });

    it('leaves digits inside a word alone', () => {
      expect(normalizeSpokenText('a1b')).toBe('a1b');
    });
  });

  describe('currency', () => {
    it('says dollars, singular for one', () => {
      expect(normalizeSpokenText('$5')).toBe('five dollars');
      expect(normalizeSpokenText('$1')).toBe('one dollar');
      expect(normalizeSpokenText('$1,250 a week')).toBe('one thousand two hundred fifty dollars a week');
    });

    it('adds cents, singular for one, and drops a zero-cents tail', () => {
      expect(normalizeSpokenText('$5.50')).toBe('five dollars and fifty cents');
      expect(normalizeSpokenText('$1.01')).toBe('one dollar and one cent');
      expect(normalizeSpokenText('$3.00')).toBe('three dollars');
    });
  });

  describe('percentages', () => {
    it('reads whole and decimal percentages, with or without a space before %', () => {
      expect(normalizeSpokenText('50%')).toBe('fifty percent');
      expect(normalizeSpokenText('2.5 %')).toBe('two point five percent');
    });
  });

  describe('clock times', () => {
    it("reads :00 as o'clock, :0X as oh-X, and other minutes as a number", () => {
      expect(normalizeSpokenText('3:00')).toBe("three o'clock");
      expect(normalizeSpokenText('3:05')).toBe('three oh five');
      expect(normalizeSpokenText('3:30')).toBe('three thirty');
      expect(normalizeSpokenText('10:45 pm')).toBe('ten forty-five pm');
    });

    it('does not treat an impossible minute as a time', () => {
      // Minutes are 00–59; anything else is read as two separate numbers.
      expect(normalizeSpokenText('25:99')).toBe('twenty-five:ninety-nine');
    });
  });

  it('reads an ampersand as "and", tidying the spaces around it', () => {
    expect(normalizeSpokenText('Tom & Jerry')).toBe('Tom and Jerry');
    expect(normalizeSpokenText('Rock&roll')).toBe('Rock and roll');
  });

  it('expands every kind in one sentence', () => {
    expect(normalizeSpokenText('Call at 9:00 & pay $20 — 10% off for 2 people.'))
      .toBe("Call at nine o'clock and pay twenty dollars — ten percent off for two people.");
  });
});
