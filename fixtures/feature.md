# Lumen Feature Fixture

A test document that exercises every construct the live preview handles.

## Inline emphasis

A sentence with **bold text**, *italic text*, ~~struck text~~, and `inline_code()`
all in one line. There is also a [link to somewhere](https://example.com).

## Headings of every size

### Three

#### Four

##### Five

###### Six

## Lists

- Bullet one
- Bullet two with **bold**
  - Nested bullet
  - Another nested
- Third top-level

1. Ordered first
2. Ordered second
3. Ordered third

- [x] Completed task
- [ ] Pending task

## Code fence

```js
function greet(name) {
  const message = `hello, ${name}`;
  return message;
}
```

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

## Table

| Feature | Status | Notes |
|---------|:------:|-------|
| Live preview | done | markers hide on blur |
| Code fences | done | focus to edit |
| Tables | done | click to edit |
| Images | done | relative paths |

## Quote and rule

> A block quote that spans a single line.

---

Trailing paragraph so the rule has breathing room.
