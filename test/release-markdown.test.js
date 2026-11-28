const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = source.indexOf('const releaseInline=');
const end = source.indexOf('const releasePage=', start);
assert.notEqual(start, -1, 'release markdown formatter exists');
assert.notEqual(end, -1, 'release page follows the formatter');

const context = {
  esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[char]));
  }
};
vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.renderReleaseMarkdown=releaseMarkdown;`, context);

test('formats common release-note headings, lists and inline emphasis', () => {
  const html = context.renderReleaseMarkdown('# Highlights\n\n- **Fast** and `safe`\n- _Simple_');
  assert.match(html, /<h3>Highlights<\/h3>/);
  assert.match(html, /<ul><li><strong>Fast<\/strong> and <code>safe<\/code><\/li><li><em>Simple<\/em><\/li><\/ul>/);
});

test('escapes raw HTML in remote release notes', () => {
  const html = context.renderReleaseMarkdown('<img src=x onerror=alert(1)>');
  assert.equal(html, '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});

test('keeps fenced code blocks as text', () => {
  const html = context.renderReleaseMarkdown('```html\n<b>literal</b>\n```');
  assert.equal(html, '<pre><code>&lt;b&gt;literal&lt;/b&gt;</code></pre>');
});
