export const nowISO = () => new Date().toISOString();

export const addMinutes = (minutes: number, date = new Date()) => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() + minutes);
  return copy.toISOString();
};

export const toISODate = (input: Date | string) => new Date(input).toISOString();
