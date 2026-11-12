import { ref, shallowRef, watch, type Ref, type ShallowRef, type WatchSource } from "vue";

export interface Loaded<T> {
  data: ShallowRef<T | undefined>;
  error: ShallowRef<unknown>;
  loading: Ref<boolean>;
  /** Ask again, after a failure. */
  reload(): void;
}

/** What `read` answers for `source`, asked again whenever `source` changes.
 *  An answer that arrives after a newer question is dropped. */
export function useLoad<S, T>(source: WatchSource<S>, read: (value: S) => Promise<T>): Loaded<T> {
  const data = shallowRef<T>();
  const error = shallowRef<unknown>();
  const loading = ref(true);
  let asked = 0;
  let last: S;
  const ask = (value: S) => {
    last = value;
    const mine = ++asked;
    loading.value = true;
    error.value = undefined;
    read(value).then(
      (answer) => {
        if (mine !== asked) return;
        data.value = answer;
        loading.value = false;
      },
      (failure) => {
        if (mine !== asked) return;
        error.value = failure;
        loading.value = false;
      },
    );
  };
  watch(source, (value) => {
    data.value = undefined;
    ask(value);
  }, { immediate: true });
  return { data, error, loading, reload: () => ask(last) };
}
