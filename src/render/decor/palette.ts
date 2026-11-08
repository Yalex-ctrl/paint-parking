/**
 * The kit's own palette is a stylised turquoise / orange (its preview shows turquoise trees on orange
 * trunks), which looks wrong in this game. Materials are re-created lit and re-coloured by NAME with
 * natural colours: brown bark, green leaves, grey stone. Unknown names keep their original colour.
 */
export const NATURAL_COLORS: Record<string, string> = {
  woodBark: '#7a5232',
  woodBarkDark: '#5b3b24',
  woodInner: '#d9b886',
  leafsGreen: '#5aa845',
  leafsDark: '#2f7a3b',
  stone: '#9a9ea6',
  _defaultMat: '#9a9ea6',
};
