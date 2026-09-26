// validate number input
export const validateNumberInput = (val: any) => {
  const valueInput = Number(val.replace(/,/g, "").replace(/ /g, ""));

  return !isNaN(valueInput);
};
