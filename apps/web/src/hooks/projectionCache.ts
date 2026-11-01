/** A per-consumer cache for pure derivations; previous values only accelerate recomputation. */
export function createProjectionCache<Input, Value>(
  derive: (input: Input, previous: Value | null) => Value,
  sameInput: (left: Input, right: Input) => boolean = Object.is,
) {
  let cached: { identity: string | null; input: Input; value: Value } | null = null;
  return (identity: string | null, input: Input): Value => {
    const previous = cached?.identity === identity ? cached : null;
    if (previous && sameInput(previous.input, input)) return previous.value;
    const value = derive(input, previous?.value ?? null);
    cached = { identity, input, value };
    return value;
  };
}
