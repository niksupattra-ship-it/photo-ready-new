export const isSingleFemaleHair=id=>id==='hair-18'||/^hair-2[1-9]$/.test(id);
export const isSingleLayerHair=id=>isSingleFemaleHair(id)||/^manhair-(0[1-9]|1[0-9]|2[0-3])$/.test(id);

