"use client";

/**
 * The two riding fields of the Compare form.
 *
 * Until this island hydrates, and always without JavaScript, it is the two
 * native selects the form has always had, so the GET form submits exactly as
 * before. Once hydrated, each side becomes a text field that suggests matching
 * ridings as the reader types, from the names the page already holds, and
 * shows the chosen riding as a chip that can be removed. The chosen id goes
 * in a hidden input under the same name, so submitting the form loads the
 * same server-rendered comparison at ?left=…&right=….
 *
 * Each field follows the ARIA combobox pattern: focus stays in the field, the
 * arrow keys move the active option, Enter chooses it, Escape closes the list.
 */

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { matchRidingChoices, normalizeRidingQuery, type RidingChoice } from "@/lib/comparison/riding-typeahead";
import type { Locale } from "@/lib/domain/localized";

const COPY = {
  en: {
    placeholder: "Type a riding or province",
    chosen: "Chosen:",
    remove: (name: string) => `Remove ${name}`,
    removed: (name: string) => `${name} removed. Type to choose another riding.`,
    picked: (name: string) => `${name} chosen.`,
    none: (query: string) => `No riding in the four provinces matches “${query}”.`,
    count: (total: number) => (total === 1 ? "1 riding matches." : `${total} ridings match.`),
    more: (shown: number, total: number) => `Showing ${shown} of ${total}. Keep typing to narrow the list.`,
    required: "Choose a riding from the list.",
  },
  fr: {
    placeholder: "Tapez une circonscription ou une province",
    chosen: "Choisie\u202F:",
    remove: (name: string) => `Retirer ${name}`,
    removed: (name: string) => `${name} retirée. Tapez pour choisir une autre circonscription.`,
    picked: (name: string) => `${name} choisie.`,
    none: (query: string) => `Aucune circonscription des quatre provinces ne correspond à «\u00A0${query}\u00A0».`,
    count: (total: number) => (total === 1 ? "1 circonscription correspond." : `${total} circonscriptions correspondent.`),
    more: (shown: number, total: number) => `${shown} sur ${total} affichées. Continuez à taper pour réduire la liste.`,
    required: "Choisissez une circonscription dans la liste.",
  },
} as const;

const neverChanges = () => () => {};
const hydrated = () => true;
const notHydrated = () => false;

/** The no-JavaScript list: grouped by province when every riding has one, as the select always was. */
function RidingOptions({ choices }: { choices: readonly RidingChoice[] }) {
  if (choices.some((choice) => choice.province === null)) {
    return <>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</>;
  }
  const groups: { province: string; choices: RidingChoice[] }[] = [];
  for (const choice of choices) {
    const last = groups.at(-1);
    if (last && last.province === choice.province) last.choices.push(choice);
    else groups.push({ province: choice.province!, choices: [choice] });
  }
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.province} label={group.province}>
          {group.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
        </optgroup>
      ))}
    </>
  );
}

type FieldProps = Readonly<{
  name: "left" | "right";
  label: string;
  locale: Locale;
  choices: readonly RidingChoice[];
  chosenId: string | null;
  exclude: string | null;
  onChoose: (id: string | null) => void;
}>;

function RidingTypeahead({ name, label, locale, choices, chosenId, exclude, onChoose }: FieldProps) {
  const text = COPY[locale];
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const chipId = `${id}-chip`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chosen = choices.find((choice) => choice.id === chosenId) ?? null;
  const { matches, total } = matchRidingChoices(query, choices, { exclude, locale });
  const searching = open && normalizeRidingQuery(query) !== "";
  const showList = searching && matches.length > 0;
  const showNone = searching && matches.length === 0;
  const activeIndex = Math.min(active, matches.length - 1);

  // A side left empty must not submit, or the server would quietly fill it.
  useEffect(() => {
    inputRef.current?.setCustomValidity(chosen ? "" : text.required);
  }, [chosen, text.required]);

  const choose = (choice: RidingChoice) => {
    onChoose(choice.id);
    setQuery("");
    setOpen(false);
    setActive(0);
    setAnnouncement(text.picked(choice.name));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (showList || showNone) {
        event.preventDefault();
        setOpen(false);
      } else if (query) {
        event.preventDefault();
        setQuery("");
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!showList) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + matches.length) % matches.length);
      return;
    }
    // With the list closed, Enter submits the form as it always has.
    if (event.key === "Enter" && showList) {
      event.preventDefault();
      choose(matches[activeIndex]!);
    }
  };

  return (
    <div className="riding-typeahead">
      <label className="riding-typeahead-label" htmlFor={inputId}>{label}</label>
      {chosen ? (
        <p className="riding-chip">
          <span className="riding-chip-text" id={chipId}>
            <span className="sr-only">{text.chosen} </span>
            <span className="riding-chip-name">{chosen.name}</span>
            {chosen.province ? <span className="riding-chip-meta">{chosen.province}</span> : null}
          </span>
          <button
            type="button"
            className="riding-chip-remove"
            aria-label={text.remove(chosen.name)}
            onClick={() => {
              onChoose(null);
              setAnnouncement(text.removed(chosen.name));
              inputRef.current?.focus();
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
          <input type="hidden" name={name} value={chosen.id} />
        </p>
      ) : null}
      <div className="riding-typeahead-field">
        <input
          ref={inputRef}
          className="input"
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={text.placeholder}
          value={query}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={chosen ? chipId : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
            setAnnouncement("");
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {showList ? (
          <div className="riding-typeahead-popup">
            <ul id={listId} role="listbox" aria-label={label} className="riding-typeahead-list">
              {matches.map((choice, index) => (
                <li
                  key={choice.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="riding-typeahead-option"
                  // Mouse down, not click: a click would blur the field first
                  // and close the list before the choice lands.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(choice);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <span className="riding-typeahead-name">{choice.name}</span>
                  {choice.province ? <span className="riding-typeahead-meta">{choice.province}</span> : null}
                </li>
              ))}
            </ul>
            {total > matches.length ? <p className="riding-typeahead-more">{text.more(matches.length, total)}</p> : null}
          </div>
        ) : null}
        {showNone ? <p className="riding-typeahead-popup riding-typeahead-message">{text.none(query.trim())}</p> : null}
      </div>
      <p className="sr-only" aria-live="polite">{searching ? text.count(total) : announcement}</p>
    </div>
  );
}

export function FederalRidingFields({
  locale,
  choices,
  leftId,
  rightId,
  leftLabel,
  rightLabel,
}: Readonly<{
  locale: Locale;
  choices: readonly RidingChoice[];
  leftId: string;
  rightId: string;
  leftLabel: string;
  rightLabel: string;
}>) {
  const ready = useSyncExternalStore(neverChanges, hydrated, notHydrated);
  const [left, setLeft] = useState<string | null>(leftId);
  const [right, setRight] = useState<string | null>(rightId);

  if (!ready) {
    return (
      <>
        <label>
          {leftLabel}
          <select name="left" defaultValue={leftId}>
            <RidingOptions choices={choices} />
          </select>
        </label>
        <label>
          {rightLabel}
          <select name="right" defaultValue={rightId}>
            <RidingOptions choices={choices} />
          </select>
        </label>
      </>
    );
  }
  return (
    <>
      <RidingTypeahead name="left" label={leftLabel} locale={locale} choices={choices} chosenId={left} exclude={right} onChoose={setLeft} />
      <RidingTypeahead name="right" label={rightLabel} locale={locale} choices={choices} chosenId={right} exclude={left} onChoose={setRight} />
    </>
  );
}
