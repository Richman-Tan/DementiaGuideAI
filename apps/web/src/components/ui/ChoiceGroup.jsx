// One choice out of a few, shown side by side: a radio group.
//
//   <ChoiceGroup
//     label="How much detail?"
//     value={settings.responseStyle}
//     onChange={(value) => setSetting('responseStyle', value)}
//     options={[{ value: 'short', label: 'Short', note: 'A few sentences.' }, …]}
//   />
//
// It is a real radio group (Radix): a screen reader hears which option is
// chosen, and the arrow keys move between them. The options sit in a row and
// wrap onto the next line when they do not fit, so it holds at any text size.
// The chosen one is marked with a tick as well as a colour, and its `note`, if
// it has one, is written out underneath.
import React, { useId } from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';

const OPTION = [
  'relative box-border flex-1 min-w-max min-h-12 px-4',
  'rounded-md border-solid border-(length:--bw) border-border',
  'bg-surface text-text font-semibold cursor-pointer transition-colors',
  'hover:border-primary',
  'data-[state=checked]:border-primary data-[state=checked]:bg-tint',
].join(' ');

const TICK = [
  'absolute -top-2 -right-2 flex size-5 items-center justify-center',
  'rounded-pill bg-primary text-on-primary text-xs',
].join(' ');

/**
 * @param {object} props
 * @param {string} props.label                       What is being chosen.
 * @param {string} props.value                       The chosen option's value.
 * @param {(value: string) => void} props.onChange
 * @param {{ value: string, label: string, note?: string }[]} props.options
 * @param {string} [props.className]                 For where it sits.
 */
export function ChoiceGroup({ label, value, onChange, options, className }) {
  const id = useId();
  const note = options.find((option) => option.value === value)?.note;
  return (
    <div className={['flex flex-col gap-2 text-left', className].filter(Boolean).join(' ')}>
      <div id={`${id}-label`} className="font-semibold">
        {label}
      </div>
      <RadioGroup.Root
        aria-labelledby={`${id}-label`}
        aria-describedby={note ? `${id}-note` : undefined}
        value={value}
        onValueChange={onChange}
        orientation="horizontal"
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <RadioGroup.Item key={option.value} value={option.value} className={OPTION}>
            {option.label}
            <RadioGroup.Indicator className={TICK} aria-hidden="true">
              ✓
            </RadioGroup.Indicator>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      {note && (
        <p id={`${id}-note`} className="m-0 text-sm text-text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
