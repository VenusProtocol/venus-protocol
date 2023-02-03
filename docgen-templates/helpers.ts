export const and = (...args) => {
  return args.every(Boolean);
};

export const bullet = (docString: string) =>
  docString
    .split("\n")
    .map((elem: string) => {
      if (elem) {
        return `* ${elem}`;
      }
      return elem;
    })
    .join("\n");
