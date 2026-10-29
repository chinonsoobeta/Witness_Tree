"use client";

/**
 * The place search field, with suggestions as the reader types.
 *
 * It is a plain GET form first: without JavaScript, or if the suggestion route
 * fails, Enter submits to the full results page exactly as before. With it, a
 * list of matching communities, ridings and provinces opens under the field,
 * each with its figure, and choosing one shows that record under the field
 * without leaving the page.
 *
 * The list follows the ARIA combobox pattern: focus stays in the field, the
 * arrow keys move the active option, Enter chooses it, Escape closes the list.
 * The query is a place name, never an address, and goes only to this site's
 * own suggestion route, which answers from committed data.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EVIDENCE_DEFINITIONS } from "@/lib/domain/evidence";
import type { Locale } from "@/lib/domain/localized";
import { cleanSearchQuery } from "@/lib/search/query";
import type { Suggestion, SuggestionPage, SuggestionRiding } from "@/lib/search/suggest";

const COPY = {
  en: {
    groups: { community: "Communities", riding: "Ridings", province: "Provinces" },
    footer: "Share of the mapped forest detected as lost, 1984–2022",
    seeAll: "See all results",
    none: (query: string) => `No place matches “${query}”. Try a town, riding or province.`,
    count: (count: number) => (count === 1 ? "1 suggestion" : `${count} suggestions`),
    failed: "Suggestions aren’t available right now. Press Enter to search.",
    clear: "Clear this result",
    lost: "of the mapped forest detected as lost, 1984–2022",
    federal: "Federal ridings",
    provincial: "Provincial ridings",
    allFor: "See all results for this place",
    page: "Open this place’s page",
    compare: "Compare with another riding",
    key: "Key",
    unknown: "Unknown",
  },
  fr: {
    groups: { community: "Collectivités", riding: "Circonscriptions", province: "Provinces" },
    footer: "Part de la forêt cartographiée détectée comme perdue, 1984–2022",
    seeAll: "Voir tous les résultats",
    none: (query: string) => `Aucun lieu ne correspond à «\u00A0${query}\u00A0». Essayez une ville, une circonscription ou une province.`,
    count: (count: number) => (count === 1 ? "1 suggestion" : `${count} suggestions`),
    failed: "Les suggestions ne sont pas disponibles pour le moment. Appuyez sur Entrée pour lancer la recherche.",
    clear: "Effacer ce résultat",
    lost: "de la forêt cartographiée détectée comme perdue, 1984–2022",
    federal: "Circonscriptions fédérales",
    provincial: "Circonscriptions provinciales",
    allFor: "Voir tous les résultats pour ce lieu",
    page: "Ouvrir la page de ce lieu",
    compare: "Comparer avec une autre circonscription",
    key: "Légende",
    unknown: "Inconnu",
  },
} as const;

const KINDS = ["community", "riding", "province"] as const;

export type SearchSuggestProps = Readonly<{
  locale: Locale;
  action: string;
  label: string;
  labelHidden?: boolean;
  placeholder?: string;
  submitLabel: string;
  defaultValue?: string;
  note?: ReactNode;
  /**
   * When given, submitting an empty or blank field stays on the page: focus stays
   * in the field and this hint shows under it, instead of opening a results page
   * that only asks for a place. Without it the form submits as a plain GET.
   */
  emptyHint?: string;
  className: string;
}>;

type Answer = Readonly<{ query: string; page: SuggestionPage | null; failed: boolean }>;

export function SearchSuggest({
  locale,
  action,
  label,
  labelHidden = false,
  placeholder,
  submitLabel,
  defaultValue = "",
  note,
  emptyHint,
  className,
}: SearchSuggestProps) {
  const text = COPY[locale];
  const id = useId();
  const inputId = `${id}-q`;
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const [query, setQuery] = useState(defaultValue);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [chosen, setChosen] = useState<Suggestion | null>(null);
  const [hinted, setHinted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // One request per pause in typing, and a newer query cancels an older one,
  // so a slow answer for "pr" can never replace the answer for "prince".
  useEffect(() => {
    const trimmed = cleanSearchQuery(query);
    if (trimmed.length < 2 || chosen?.name === query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search/suggest?locale=${locale}&q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<SuggestionPage>) : Promise.reject(new Error(String(response.status)))))
        .then((next) => {
          setAnswer({ query: trimmed, page: next, failed: false });
          setActive(next.suggestions.length > 0 ? 0 : -1);
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === "AbortError") return;
          setAnswer({ query: trimmed, page: null, failed: true });
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale, chosen]);

  // An answer counts only for the query now in the field, and not once a
  // suggestion has been chosen, so a stale list can never be shown.
  const trimmed = cleanSearchQuery(query);
  const current = answer && answer.query === trimmed && trimmed.length >= 2 && chosen?.name !== query ? answer : null;
  const suggestions = current?.page?.suggestions ?? [];
  const ready = current !== null && !current.failed;
  const showList = open && ready && suggestions.length > 0;
  const showNone = open && ready && suggestions.length === 0;
  const showFailed = open && current?.failed === true;
  const numbered = suggestions.map((suggestion, optionIndex) => ({ suggestion, optionIndex }));
  const allHref = `${action}?q=${encodeURIComponent(trimmed)}`;

  const choose = (suggestion: Suggestion) => {
    setChosen(suggestion);
    setQuery(suggestion.name);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      // A search field clears itself on Escape. While anything is showing under
      // it, Escape only closes that, so the reader's words survive.
      if (showList || showNone || showFailed) event.preventDefault();
      setOpen(false);
      return;
    }
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(suggestions[active]!);
    }
  };

  return (
    <div className={`search-suggest ${className}`}>
      <form
        className="search-suggest-form"
        method="get"
        action={action}
        role="search"
        onSubmit={(event) => {
          // Not `required`, whose browser message is generic. Only an empty or blank
          // field is held here; any other query submits exactly as before.
          if (emptyHint === undefined || query.trim() !== "") return;
          event.preventDefault();
          setHinted(true);
          inputRef.current?.focus();
        }}
      >
        <label className={labelHidden ? "field-label sr-only" : "search-suggest-label"} htmlFor={inputId}>{label}</label>
        <div className="search-suggest-row">
          <div className="search-suggest-field">
            <input
              ref={inputRef}
              className="input"
              id={inputId}
              name="q"
              type="search"
              autoComplete="off"
              placeholder={placeholder}
              value={query}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
              aria-describedby={hinted ? hintId : undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setChosen(null);
                setOpen(true);
                setHinted(false);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
            />
            {showList ? (
              <div className="search-suggest-popup">
                <ul id={listId} role="listbox" aria-label={label} className="search-suggest-list">
                  {KINDS.map((kind) => {
                    const rows = numbered.filter(({ suggestion }) => suggestion.kind === kind);
                    if (rows.length === 0) return null;
                    return [
                      <li key={`${kind}-heading`} role="presentation" className="search-suggest-group">{text.groups[kind]}</li>,
                      ...rows.map(({ suggestion, optionIndex }) => {
                        return (
                          <li
                            key={`${suggestion.kind}-${suggestion.id}`}
                            id={`${listId}-${optionIndex}`}
                            role="option"
                            aria-selected={optionIndex === active}
                            className="search-suggest-option"
                            // Mouse down, not click: a click would blur the field
                            // first and close the list before the choice lands.
                            onMouseDown={(event) => {
                              event.preventDefault();
                              choose(suggestion);
                            }}
                            onMouseEnter={() => setActive(optionIndex)}
                          >
                            <span className="search-suggest-text">
                              <span className="search-suggest-name">{suggestion.name}</span>
                              <span className="search-suggest-meta">{suggestion.meta}</span>
                            </span>
                            {suggestion.figure ? (
                              <span className="search-suggest-figure">
                                <span className="mark-glyph mark-glyph--satellite" aria-hidden="true" />
                                {suggestion.figure}
                              </span>
                            ) : suggestion.unknownReason ? (
                              <span className="search-suggest-figure search-suggest-figure--unknown">
                                <span className="mark-glyph mark-glyph--unknown" aria-hidden="true" />
                                {text.unknown}
                              </span>
                            ) : null}
                          </li>
                        );
                      }),
                    ];
                  })}
                </ul>
                <div className="search-suggest-footer">
                  <span className="search-suggest-footnote">
                    <span className="mark-glyph mark-glyph--satellite" aria-hidden="true" />
                    {text.footer}
                  </span>
                  {/* A link inside the popup must not steal focus before it is followed. */}
                  <a href={allHref} onMouseDown={(event) => event.preventDefault()}>{text.seeAll}</a>
                </div>
              </div>
            ) : null}
            {showNone ? <p className="search-suggest-popup search-suggest-message" role="status">{text.none(trimmed)}</p> : null}
            {showFailed ? <p className="search-suggest-popup search-suggest-message" role="status">{text.failed}</p> : null}
            {/* Always in the tree and empty until needed, so the live region exists before its words arrive. */}
            {emptyHint !== undefined ? <p id={hintId} className="search-suggest-hint" aria-live="polite">{hinted ? emptyHint : ""}</p> : null}
          </div>
          <button className="btn btn--primary" type="submit">{submitLabel}</button>
        </div>
        <p className="sr-only" aria-live="polite">{ready && open ? text.count(suggestions.length) : ""}</p>
        {note}
      </form>
      {chosen ? (
        <section className="search-chosen" aria-labelledby={`${id}-chosen`}>
          <div className="search-chosen-head">
            <div>
              <p className="eyebrow">{chosen.meta}</p>
              <h2 id={`${id}-chosen`}>{chosen.name}</h2>
            </div>
            <button
              type="button"
              className="search-chosen-clear"
              aria-label={text.clear}
              onClick={() => {
                setChosen(null);
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {chosen.figure ? (
            <p className="search-chosen-figure">
              <span className="search-chosen-value">
                <span className="mark-glyph mark-glyph--satellite" aria-hidden="true" />
                {chosen.figure}
              </span>
              <span>{text.lost}</span>
            </p>
          ) : null}
          <p className="search-chosen-detail">{chosen.detail}</p>
          {chosen.ridings.length > 0 ? (
            <div className="search-chosen-ridings">
              {chosen.ridingsNote ? <p className="search-chosen-ridings-note">{chosen.ridingsNote}</p> : null}
              {(["federal", "provincial"] as const).map((level) => {
                const rows = chosen.ridings.filter((riding) => riding.level === level);
                if (rows.length === 0) return null;
                // Many ridings with the same Unknown read as one line with their
                // count; the server names those groups and writes their lines.
                const groups = (chosen.ridingGroups ?? []).filter((group) => group.level === level);
                const listed = rows.filter((riding) => !groups.some((group) => group.reason === riding.unknownReason));
                const list = (members: readonly SuggestionRiding[]) => (
                  <ul>
                    {members.map((riding) => (
                      <li key={riding.name}>
                        <span className="search-chosen-riding-name">
                          {riding.href ? <a href={riding.href}>{riding.name}</a> : riding.name}
                        </span>
                        {riding.figure ? (
                          <span className="search-chosen-riding-figure">
                            <span className="mark-glyph mark-glyph--satellite" aria-hidden="true" />
                            {riding.figure}
                          </span>
                        ) : null}
                        <span className="search-chosen-riding-share">{riding.share}</span>
                        <span className="search-chosen-riding-detail">{riding.detail}</span>
                      </li>
                    ))}
                  </ul>
                );
                return (
                  <div key={level}>
                    <h3 className="eyebrow">{level === "federal" ? text.federal : text.provincial}</h3>
                    {listed.length ? list(listed) : null}
                    {groups.map((group) => (
                      <details key={group.reason} className="search-unknown-group">
                        <summary>
                          <span className="mark-glyph mark-glyph--unknown" aria-hidden="true" />
                          <span>{group.heading}</span>
                        </summary>
                        {list(rows.filter((riding) => riding.unknownReason === group.reason))}
                      </details>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="search-chosen-foot">
            {chosen.href ? <a href={chosen.href}>{text.page}</a> : null}
            <a href={`${action}?q=${encodeURIComponent(chosen.name)}`}>{text.allFor}</a>
            {chosen.compareHref ? <a href={chosen.compareHref}>{text.compare}</a> : null}
            <p className="evidence-key">
              <span className="evidence-key-title">{text.key}</span>
              <span className="evidence-key-item">
                <span className="mark-glyph mark-glyph--satellite" aria-hidden="true" />
                {EVIDENCE_DEFINITIONS["satellite-observation"].label[locale]}
              </span>
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
