import { normalizeSpokenText, unsettledTailStart } from './normalizeSpokenText';
import { buildSystemPrompt } from '../rag/prompt';
import phoneAllowlist from '../../../scripts/eval/fixtures/phone-allowlist.json';

// Numbers become words before TTS so the provider's character alignment carries
// real letters the lip-sync can animate. The spoken audio is the same either way,
// except for phone numbers, which are now read digit by digit (see below).

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
      expect(normalizeSpokenText('007')).toBe('seven');
    });

    it('reads decimals digit by digit after "point"', () => {
      expect(normalizeSpokenText('3.14')).toBe('three point one four');
    });

    it('leaves digits inside a word alone', () => {
      expect(normalizeSpokenText('a1b')).toBe('a1b');
    });

    it('reads a run too long to be a quantity digit by digit instead of throwing', () => {
      // 309+ digits overflow to Infinity, which used to recurse into a RangeError;
      // past 15 digits a JS number is no longer exact anyway.
      expect(normalizeSpokenText('9'.repeat(309))).toBe(Array(309).fill('nine').join(' '));
      expect(normalizeSpokenText('1234567890123456')).toBe(
        'one two three four five six seven eight nine zero one two three four five six');
      expect(normalizeSpokenText('123456789012345')).toBe(
        'one hundred twenty-three thousand four hundred fifty-six billion '
        + 'seven hundred eighty-nine million twelve thousand three hundred forty-five');
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

    it('reads an amount written without thousands commas whole', () => {
      // Used to stop at the third digit: "one hundred twenty-five dollars0".
      expect(normalizeSpokenText('$1250 a week')).toBe('one thousand two hundred fifty dollars a week');
    });

    it('reads a very long amount digit by digit instead of throwing', () => {
      expect(normalizeSpokenText(`$${'9'.repeat(309)}`)).toBe(`${Array(309).fill('nine').join(' ')} dollars`);
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

  // Phone numbers are read digit by digit, zero as "oh", the way New Zealanders
  // say them. "Call 111" used to be spoken "call one hundred eleven".
  describe('phone numbers', () => {
    describe('every helpline the assistant can give', () => {
      it.each([
        ['Call 111 now.', 'Call one one one now.'],
        ['You can call or text 1737 any time.', 'You can call or text one seven three seven any time.'],
        ['Healthline (0800 611 116)', 'Healthline (oh eight hundred, six one one, one one six)'],
        ['Alzheimers New Zealand on 0800 004 001.', 'Alzheimers New Zealand on oh eight hundred, oh oh four, oh oh one.'],
        ['Lifeline on 0800 543 354', 'Lifeline on oh eight hundred, five four three, three five four'],
        ['the Suicide Crisis Helpline, 0508 828 865', 'the Suicide Crisis Helpline, oh five oh eight, eight two eight, eight six five'],
        // Dementia Australia, named only by the v1 rollback prompt.
        ['Dementia Australia (1800 100 500)', 'Dementia Australia (one eight hundred, one oh oh, five oh oh)'],
        // Other lines the model has given in the eval runs.
        ['Elder abuse: 0800 32 668 65', 'Elder abuse: oh eight hundred, three two, six six eight, six five'],
        ['National Poisons Centre 0800 764 766', 'National Poisons Centre oh eight hundred, seven six four, seven six six'],
      ])('%s → %s', (written, spoken) => {
        expect(normalizeSpokenText(written)).toBe(spoken);
      });

      it('reads every number on the verified allowlist as digits', () => {
        // scripts/eval/fixtures/phone-allowlist.json: the knowledge base, the v2
        // prompt and the crisis lines, stored as bare digits.
        for (const digits of phoneAllowlist.numbers) {
          const spoken = normalizeSpokenText(`call ${digits}`);
          expect(spoken).toMatch(/^call (oh|one|two|three|four|five|six|seven|eight|nine)\b/);
          expect(spoken).not.toMatch(/\d|hundred (?!,)|thousand/);
        }
      });

      it('speaks the v2 prompt\'s own safety numbers digit by digit', () => {
        const spoken = normalizeSpokenText(buildSystemPrompt({}));
        expect(spoken).toContain('tell them to call one one one at the START');
        expect(spoken).toContain('Healthline (oh eight hundred, six one one, one one six, free twenty-four/seven nurse advice)');
        expect(spoken).toContain('support line (oh eight hundred, oh oh four, oh oh one)');
        expect(spoken).toContain('call or text one seven three seven any time');
        expect(spoken).not.toMatch(/one hundred eleven|one thousand seven hundred|eight hundred six hundred/);
      });
    });

    describe('written forms', () => {
      it.each([
        ['0800-611-116', 'oh eight hundred, six one one, one one six'],
        ['0800\u00a0611\u00a0116', 'oh eight hundred, six one one, one one six'],
        ['0800611116', 'oh eight hundred, six one one, one one six'],
        ['call **111** now', 'call **one one one** now'],
        ['emergency services (111)', 'emergency services (one one one)'],
        ['Call 111, then wait.', 'Call one one one, then wait.'],
        ['Ring 111? Yes.', 'Ring one one one? Yes.'],
        ['call/text 1737', 'call/text one seven three seven'],
      ])('%s → %s', (written, spoken) => {
        expect(normalizeSpokenText(written)).toBe(spoken);
      });

      it('reads NZ landlines and mobiles in their groups', () => {
        expect(normalizeSpokenText('09 123 4567')).toBe('oh nine, one two three, four five six seven');
        expect(normalizeSpokenText('(09) 123 4567')).toBe('oh nine, one two three, four five six seven');
        expect(normalizeSpokenText('091234567')).toBe('oh nine, one two three, four five six seven');
        expect(normalizeSpokenText('021 123 4567')).toBe('oh two one, one two three, four five six seven');
        expect(normalizeSpokenText('027 123 456')).toBe('oh two seven, one two three, four five six');
      });

      it('leaves groups past a full number to the ordinary rules', () => {
        expect(normalizeSpokenText('Healthline 0800 611 116 24/7'))
          .toBe('Healthline oh eight hundred, six one one, one one six twenty-four/seven');
        expect(normalizeSpokenText('09 123 4567 24 hours'))
          .toBe('oh nine, one two three, four five six seven twenty-four hours');
      });

      it('starts a new number where the last one ends', () => {
        expect(normalizeSpokenText('0800 611 116 0800 004 001'))
          .toBe('oh eight hundred, six one one, one one six oh eight hundred, oh oh four, oh oh one');
        expect(normalizeSpokenText('05 0800 611 116')).toBe('five oh eight hundred, six one one, one one six');
      });

      it('says the name of a bare freephone prefix', () => {
        expect(normalizeSpokenText('an 0800 number')).toBe('an oh eight hundred number');
        expect(normalizeSpokenText('0508 numbers and (0900) lines')).toBe('oh five oh eight numbers and oh nine hundred lines');
        expect(normalizeSpokenText('0800 EA NOT OK')).toBe('oh eight hundred EA NOT OK');
      });

      it('leaves leading-zero runs that are not NZ phone numbers as they were', () => {
        expect(normalizeSpokenText('05')).toBe('five');
        expect(normalizeSpokenText('(09)')).toBe('(nine)');
        expect(normalizeSpokenText('09-12-2026')).toBe('nine-twelve-two thousand twenty-six');
        expect(normalizeSpokenText('0800611')).toBe('eight hundred thousand six hundred eleven');
        expect(normalizeSpokenText('0.5 mg')).toBe('zero point five mg');
        expect(normalizeSpokenText('08:30')).toBe('eight thirty');
      });
    });

    describe('111 and 1737 need a cue, so other uses stay numbers', () => {
      it.each([
        // A calling word within four words before, in the same sentence.
        ['dial 111', 'dial one one one'],
        ['ring 111', 'ring one one one'],
        ['phone 111', 'phone one one one'],
        ['text 1737', 'text one seven three seven'],
        ['reach out to 1737', 'reach out to one seven three seven'],
        ['a trained counsellor at 1737', 'a trained counsellor at one seven three seven'],
        ['a counsellor via 1737', 'a counsellor via one seven three seven'],
        ['support lines like 1737', 'support lines like one seven three seven'],
        ['emergency services — (111)', 'emergency services — (one one one)'],
        ['call them now and 111', 'call them now and one one one'],
        // A whole phone number counts as one word of the four.
        ['Family Services (0800 211 211) or 1737',
          'Family Services (oh eight hundred, two one one, two one one) or one seven three seven'],
        ['Call 111 or 1737', 'Call one one one or one seven three seven'],
        // Or a cue straight after it.
        ['the 111 operator', 'the one one one operator'],
        ['it needs 111 straight away', 'it needs one one one straight away'],
        ['they need 111 immediately', 'they need one one one immediately'],
        ['1737 any time', 'one seven three seven any time'],
      ])('%s → %s', (written, spoken) => {
        expect(normalizeSpokenText(written)).toBe(spoken);
      });

      it.each([
        ['111 people', 'one hundred eleven people'],
        ['1737 steps', 'one thousand seven hundred thirty-seven steps'],
        // The cue is five words back, or in the previous sentence.
        ['call a b c d 111', 'call a b c d one hundred eleven'],
        ['Call your GP. 111 people came.', 'Call your GP. one hundred eleven people came.'],
        // Part of another number, an amount, a percentage or a range.
        ['call 1,111', 'call one thousand one hundred eleven'],
        ['call 1.111', 'call one point one one one'],
        ['call $111', 'call one hundred eleven dollars'],
        ['call 111%', 'call one hundred eleven percent'],
        ['call 100-111', 'call one hundred-one hundred eleven'],
        ['call 111-222', 'call one hundred eleven-two hundred twenty-two'],
        ['call 1110', 'call one thousand one hundred ten'],
      ])('%s → %s', (written, spoken) => {
        expect(normalizeSpokenText(written)).toBe(spoken);
      });
    });

    it('leaves ordinary numbers as they were', () => {
      expect(normalizeSpokenText('Take 2 tablets 3 times a day.')).toBe('Take two tablets three times a day.');
      expect(normalizeSpokenText('About 65 years, in 2026.')).toBe('About sixty-five years, in two thousand twenty-six.');
      expect(normalizeSpokenText('30% of 70,000 people')).toBe('thirty percent of seventy thousand people');
      expect(normalizeSpokenText('wait 10-15 minutes on 2 or 3 days')).toBe('wait ten-fifteen minutes on two or three days');
    });

    it('accepts that a weak cue can mark a stray 111 (reads it as digits, never wrongly as a helpline)', () => {
      // "on" and "at" are cues because the model writes "at 1737" and "on
      // 0800 …"; the price is that a rare "on page 111" is read one one one.
      expect(normalizeSpokenText('on page 111')).toBe('on page one one one');
    });
  });

  // The streaming path normalises a few words at a time, so it holds back what
  // the next words could still change.
  describe('unsettledTailStart', () => {
    const tail = (text) => text.slice(unsettledTailStart(text));

    it('holds nothing when no number or cue is open', () => {
      expect(tail('Rest helps. ')).toBe('');
      expect(tail('Call 111. ')).toBe('');
      expect(tail('')).toBe('');
    });

    it('holds a trailing number, which more groups or its cue word may follow', () => {
      expect(tail('Healthline is 0800 611 ')).toBe('0800 611 ');
      expect(tail('Take 2 ')).toBe('2 ');
    });

    it('holds a cue word until four more words have passed', () => {
      expect(tail('Please call ')).toBe('call ');
      expect(tail('If worried, call them now and ')).toBe('call them now and ');
      expect(tail('If worried, call them now and then ')).toBe('');
    });

    it('holds the cue with the number it introduces', () => {
      expect(tail('Please call or text 1737 ')).toBe('call or text 1737 ');
      expect(tail('Family Services (0800 211 211) or ')).toBe('Services (0800 211 211) or ');
    });

    it('lets a sentence end close the window', () => {
      expect(tail('Call now. 111 ')).toBe('111 ');
      expect(tail('Call now. — ')).toBe('');
    });
  });
});
