# 04. Learn to read the code

You can follow this chapter without having written a program. The examples use invented payment records. Run the setup in the handbook first if you want to execute them.

## The five pieces you will meet

| Name | What it is | Where it appears |
| --- | --- | --- |
| Python | The programming language used to parse statements, detect patterns and serve the main API. | Files under `src/` and `tests/`. |
| JavaScript | A language that runs in browsers and in Node.js. | Browser tests use `.mjs` files. The alternate demo server uses `src/server.js`. |
| TypeScript | JavaScript with checks on expected data shapes. Types help while editing and building. | Frontend logic uses `.ts`. Components with HTML-like expressions use `.tsx`. |
| React | A library for rendering components from data and responding to changes. | `frontend/src/App.tsx` and `frontend/src/components/`. |
| CSS | Rules for the appearance of rendered elements. | `frontend/src/index.css`, `App.css` and feature stylesheets. |

FastAPI connects Python functions to HTTP routes. Vite runs the frontend development server and prepares production assets. Node runs npm, Vite, ESLint and frontend tests. npm installs JavaScript dependencies. pip installs Python dependencies. PostgreSQL and SQLite are databases. They both understand SQL, the language for querying tables, but run in different environments.

## Paths, files and commands

The repository root is the folder containing `README.md`, `src/` and `frontend/`. A path such as `src/api.py` is relative to that folder. In a terminal, `cd frontend` changes where subsequent commands look for files. `cd ..` moves up one folder. In PowerShell, `Get-Location` prints the current folder and `Get-ChildItem` lists its contents.

Run Python modules from the root unless a command specifies otherwise. `python -m src.detect_recurring_v3` asks Python to find and run that module as part of the `src` package. `npm run build --prefix frontend` asks npm to use the scripts in `frontend/package.json` while leaving your terminal in the root. Check the command's working directory before assuming a missing file was deleted.

An environment variable is a setting available to the process. In PowerShell, `$env:NAME = 'value'` affects new processes launched from that terminal. A second terminal can have different values. Build-time Vite variables become part of the browser bundle and must be public. Server-only values such as database URLs, token digests and encryption keys belong in server configuration, never in a `VITE_` variable.

## Python by example

Start a Python prompt with `python` and enter these lines, without the prompt markers.

~~~python
debits = [
    {"date": "2025-01-05", "description": "Example Studio", "amount": 80},
    {"date": "2025-02-05", "description": "Example Studio", "amount": 80},
]
len(debits)
debits[0]["description"]
sum(row["amount"] for row in debits)
~~~

The expected results are `2`, `'Example Studio'` and `160`. A list holds items in order. An index starts at zero, so `debits[0]` means the first item. A dictionary uses named keys such as `"amount"`. The expression inside `sum` takes the amount from each row. Enter `exit()` to close the prompt.

A function names a reusable operation. Indentation defines its body.

~~~python
def annualize_monthly(amount):
    return amount * 12

annualize_monthly(80)
~~~

The result is `960`. FinSight applies a similar multiplier to supported cadence estimates. The real app also handles missing amounts, other cadences and evidence. A Python value of `None` means missing or unavailable. It is different from a numeric zero. An exception interrupts normal execution. For example, parsing an invalid date can raise `ValueError`, which a route can convert into a readable error response.

Python functions can declare argument types, such as `rows: list[dict]`. The annotation explains the intended shape and supports tooling. The function still needs runtime validation when it accepts input from a file or browser.

### Read a real FinSight function

Open [the statement mapper](../../src/private_statement.py). In `map_statement`, read from top to bottom and mark these checkpoints:

1. The mapping must be a dictionary.
2. Required fields differ for signed and split amount layouts.
3. Indices must be distinct integers inside the CSV width.
4. Each row is checked for date, description, payment method and amount.
5. The normalized result stores a positive amount and a separate direction.

Ask what could break if two fields used the same index. A description could be read as a date, or an amount column could be counted as both debit and credit. The early check prevents that ambiguity before analysis.

## TypeScript by example

A TypeScript type can describe a transaction displayed in a component:

~~~typescript
type ExampleDebit = {
  date: string
  amount: number
}

function total(debits: ExampleDebit[]): number {
  return debits.reduce((sum, debit) => sum + debit.amount, 0)
}
~~~

`string` means text. `number` means a numeric value. `ExampleDebit[]` means an array of records with the two fields. `reduce` walks the array, updating an accumulator. Here the accumulator starts at zero. A type is removed by the build and does not validate JSON at runtime. FinSight often uses `Record<string, unknown>` for fields received across a flexible API boundary. A guard such as `typeof row.amount === 'number'` checks the actual value before it is used.

| Expression | Meaning |
| --- | --- |
| `items.map(render)` | Produce one result for each item. |
| `items.filter(predicate)` | Keep items that satisfy a condition. |
| `value ?? fallback` | Use the fallback if the value is null or undefined. A zero remains a zero. |
| `value?.field` | Read a field when the parent value exists. |
| `async / await` | Wait for work such as a network request without treating its eventual result as already available. |
| `import type` | Import a declaration needed for checking, with no runtime import. |

## React components, props and state

A component is a function that returns what should appear. Props are values passed in by a parent. State is a value the component owns across renders.

~~~tsx
import { useState } from 'react'

function SampleToggle({ label }: { label: string }) {
  const [included, setIncluded] = useState(false)

  return (
    <label>
      <input
        type="checkbox"
        checked={included}
        onChange={event => setIncluded(event.target.checked)}
      />
      {label}
    </label>
  )
}
~~~

This is a teaching snippet. The browser calls `onChange` when the user interacts, the handler updates state, and React renders the checkbox again. Labels connect text to inputs and support keyboard and assistive technology. A React `key` tells React which item is which among siblings. A stable transaction ID is usually a better key than an array index when rows can move.

An effect synchronizes a component with work outside rendering. Cleanup matters for requests that outlive a view. FinSight uses `AbortController` in several features so an old request can be abandoned on unmount. A ref can store a pending request or DOM element without triggering another render.

### Trace a real interaction

Open [the forecast view](../../frontend/src/components/ForecastPanel.tsx) and [the buffer planner](../../frontend/src/components/CashBufferPlanner.tsx). The forecast passes entries, a display-name function and an amount-formatting function as props. The planner holds input text and selections in state. It validates text before using it as a number. The pure helper in [cashBuffer.ts](../../frontend/src/components/cashBuffer.ts) groups estimated debits by date, performs cent arithmetic and returns daily balances. That separation lets a unit test check balances without launching a browser.

## JSON, CSV and the browser network panel

A CSV file is a table represented as text. A quoted comma belongs inside a field. JSON expresses nested records, lists, numbers and booleans. Here is the same idea in both formats.

~~~csv
date,description,amount
2025-01-05,"Example Studio, Monthly",-80
~~~

~~~json
{"date":"2025-01-05","description":"Example Studio, Monthly","amount":80,"direction":"debit"}
~~~

The CSV is source data. The JSON example is normalized data. The signed source amount becomes a positive magnitude and explicit debit direction. Quoting the descriptor preserves the comma in both forms.

In browser developer tools, the Network panel shows requests made by a page. With the synthetic demo open, look for `/api/summary`. Read its status and response. Use synthetic data for this exercise because developer tools can display financial rows or tokens in full. If the page shows a 404, check which address you opened and which server is listening. If a 200 response still produces a broken view, inspect the expected field names before modifying CSS.

## A practical code-reading routine

1. Reproduce one behavior with the bundled demo.
2. Identify a component by its visible heading, then search for that heading in source.
3. Find what data it reads and which parent passes that data.
4. Follow the request helper to the API route if the data comes from the server.
5. Find the smallest existing test that covers the behavior. Add a synthetic regression when changing a rule.
6. Run that test, then the broader checks in the testing chapter.

The next chapter follows that routine across FinSight's major paths. [Architecture and code](05-architecture-and-code.md)

