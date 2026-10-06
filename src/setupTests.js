// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// The language of the page comes from its address (mikardex.cl/ is Spanish, /en/ is English).
// The tests were written against the English page, so each one starts there; a test about
// Spanish stores the language, as a visitor who picked it would, or opens "/" itself.
beforeEach(() => {
  window.history.replaceState(null, "", "/en/");
});
