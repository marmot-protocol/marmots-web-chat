import { RumorStore } from "applesauce-core/event-store";
import { kinds, type Rumor } from "applesauce-core/helpers/event";
import type { GroupRumorHistory } from "@internet-privacy/marmot-ts";
import {
  BehaviorSubject,
  EMPTY,
  combineLatest,
  from,
  fromEvent,
  merge,
  type Subscription,
} from "rxjs";
import {
  catchError,
  filter,
  map,
  startWith,
  switchMap,
  tap,
} from "rxjs/operators";

/** Loading state for the local history window. */
export interface PaginationState {
  loadingOlder: boolean;
  exhausted: boolean;
}

const TIMELINE_KINDS = [kinds.ChatMessage, kinds.Reaction];
const HISTORY_WINDOW = 50;

/** Callbacks for projecting local history. */
export interface GroupTimelineOptions {
  onChange?: () => void;
  onError: (error: unknown) => void;
}

/**
 * Project library-owned history into a RumorStore for reactive chat rendering.
 * RxJS switches away from stale reads and owns listener cleanup. History remains
 * authoritative, including fork retractions and clears.
 */
export class GroupTimeline {
  readonly store = new RumorStore();
  /** Loading state for the local history window, for reactive UI. */
  readonly pagination$ = new BehaviorSubject<PaginationState>({
    loadingOlder: false,
    exhausted: false,
  });
  readonly #limit$ = new BehaviorSubject(HISTORY_WINDOW);
  readonly #subscription: Subscription;
  readonly #options: GroupTimelineOptions;
  #closed = false;
  #loadingOlder = false;
  #exhausted = false;

  constructor(history: GroupRumorHistory, options: GroupTimelineOptions) {
    this.#options = options;
    const changes$ = merge(
      fromEvent<Rumor>(history, "rumor").pipe(
        filter((rumor) => TIMELINE_KINDS.includes(rumor.kind)),
      ),
      fromEvent<string>(history, "removed").pipe(
        tap((id) => this.store.remove(id)),
      ),
      fromEvent(history, "cleared").pipe(
        tap(() => this.store.removeByFilters({})),
      ),
    ).pipe(startWith(undefined));

    this.#subscription = combineLatest([this.#limit$, changes$])
      .pipe(
        switchMap(([limit]) =>
          from(history.queryRumors({ kinds: TIMELINE_KINDS, limit })).pipe(
            map((rumors) => ({ rumors, limit })),
            catchError((error) => {
              this.#loadingOlder = false;
              options.onError(error);
              this.#changed();
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe(({ rumors, limit }) => {
        const ids = new Set(rumors.map((rumor) => rumor.id));
        for (const existing of this.store.getTimeline({})) {
          if (!ids.has(existing.id)) this.store.remove(existing.id);
        }
        for (const rumor of rumors) this.store.add(rumor);
        this.#exhausted = rumors.length < limit;
        this.#loadingOlder = false;
        this.#changed();
      });
  }

  #changed(): void {
    if (this.#closed) return;
    this.pagination$.next(this.pagination);
    this.#options.onChange?.();
  }

  /** A copy of loading state, safe to include in a UI snapshot. */
  get pagination(): PaginationState {
    return { loadingOlder: this.#loadingOlder, exhausted: this.#exhausted };
  }

  /** Expand the window instead of skipping messages with equal timestamps. */
  loadOlder(): void {
    if (this.#closed || this.#loadingOlder || this.#exhausted) return;
    this.#loadingOlder = true;
    this.#changed();
    this.#limit$.next(this.#limit$.value + HISTORY_WINDOW);
  }

  /** Detach idle listeners immediately and ignore late promise completions. */
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#subscription.unsubscribe();
    this.#limit$.complete();
    this.pagination$.complete();
    this.store.dispose();
  }
}
