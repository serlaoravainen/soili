---
name: TypeScript & React Best Practices
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: false
description: Käytä aina TypeScriptin ja Reactin parhaita käytäntöjä
---

- Käytä aina TypeScriptin `interface` kun määrittelet objektin muodon
- Vältä `any`, käytä `unknown` tai tarkempia tyyppejä
- Käytä Reactissa funktionaalisia komponentteja
- Käytä `React.FC` vain jos tarvitset children-propsia
- Käytä `useEffect` ja `useMemo` riippuvuustaulukon kanssa oikein
- Pidä komponentit lyhyinä ja jaa ne pienempiin osiin jos kasvavat isoiksi