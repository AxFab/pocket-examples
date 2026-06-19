#!/usr/bin/env node
/**
 * Ledger CLI entry point: argv parsing, command dispatch, console output.
 *
 * Kept separate from `ledger-service.ts` so the storage logic stays
 * testable without spawning a process.
 */
import path from "node:path";
import { initDatabase, type LedgerDatabase } from "./db.js";
import {
  addTransaction,
  listTransactions,
  monthlyReport,
  adjustAmount,
  editTransaction,
  removeTransaction,
  listCategories
} from "./ledger-service.js";
import { formatCurrency, formatDate, parseDateArg, parseMonthArg, parseAmountArg } from "./format.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), "ledger.pdb");

function dbPath(): string {
  return process.env.LEDGER_DB ?? DEFAULT_DB_PATH;
}

/** Splits argv into positional arguments and `--key=value` flags. */
function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of args) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      flags[match[1]] = match[2];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printHelp(): void {
  console.log(`Usage: ledger <command> [options]

Commands:
  add <amount> <category> [note...]    Record a transaction (amount: signed decimal, e.g. -12.50)
  list [--category=X] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--search=text] [--skip=N] [--limit=N]
  report <YYYY-MM>                     Per-category totals for a month
  categories                           Distinct categories seen so far
  adjust <id> <delta>                  Add <delta> to a transaction's amount ($inc)
  edit <id> [--category=X] [--note=text]
  rm <id>
  stats                                Database + collection usage stats
  compact                              Reclaim space from deleted/updated records
  help                                 Show this message

Database file: ${dbPath()} (override with LEDGER_DB=path)`);
}

function run(database: LedgerDatabase, command: string | undefined, args: string[]): void {
  const { transactions } = database;
  const { positional, flags } = parseFlags(args);

  switch (command) {
    case "add": {
      const [amountArg, category, ...noteParts] = positional;
      if (!amountArg || !category) throw new Error("Usage: ledger add <amount> <category> [note...]");
      const result = addTransaction(transactions, {
        amount: parseAmountArg(amountArg),
        category,
        note: noteParts.join(" ")
      });
      console.log(`Added ${result.insertedId}`);
      break;
    }

    case "list": {
      const rows = listTransactions(transactions, {
        category: flags.category,
        from: flags.from ? parseDateArg(flags.from) : undefined,
        to: flags.to ? parseDateArg(flags.to) : undefined,
        search: flags.search,
        skip: flags.skip ? Number(flags.skip) : undefined,
        limit: flags.limit ? Number(flags.limit) : undefined
      });
      if (rows.length === 0) {
        console.log("No transactions.");
        break;
      }
      for (const row of rows) {
        const date = formatDate(row.date as number);
        const amount = formatCurrency(row.amount as number).padStart(9);
        console.log(`${row._id}  ${date}  ${amount}  ${row.category as string}  ${row.note as string}`);
      }
      break;
    }

    case "report": {
      const [monthArg] = positional;
      if (!monthArg) throw new Error("Usage: ledger report <YYYY-MM>");
      const { year, month } = parseMonthArg(monthArg);
      const summary = monthlyReport(transactions, year, month);
      console.log(`Report for ${monthArg} — ${summary.count} transaction(s)`);
      for (const [category, sum] of Object.entries(summary.totalsByCategory).sort()) {
        console.log(`  ${category.padEnd(16)} ${formatCurrency(sum)}`);
      }
      console.log(`  ${"TOTAL".padEnd(16)} ${formatCurrency(summary.total)}`);
      break;
    }

    case "categories": {
      for (const category of listCategories(transactions)) console.log(category);
      break;
    }

    case "adjust": {
      const [id, deltaArg] = positional;
      if (!id || !deltaArg) throw new Error("Usage: ledger adjust <id> <delta>");
      const result = adjustAmount(transactions, id, parseAmountArg(deltaArg));
      console.log(`Modified ${result.modifiedCount}`);
      break;
    }

    case "edit": {
      const [id] = positional;
      if (!id) throw new Error("Usage: ledger edit <id> [--category=X] [--note=text]");
      const result = editTransaction(transactions, id, { category: flags.category, note: flags.note });
      console.log(`Modified ${result.modifiedCount}`);
      break;
    }

    case "rm": {
      const [id] = positional;
      if (!id) throw new Error("Usage: ledger rm <id>");
      const result = removeTransaction(transactions, id);
      console.log(`Deleted ${result.deletedCount}`);
      break;
    }

    case "stats": {
      console.log("Database:", database.db.stats());
      console.log("Collection:", transactions.stats());
      break;
    }

    case "compact": {
      database.db.compact();
      console.log("Compacted.");
      break;
    }

    case "help":
    case undefined:
      printHelp();
      break;

    default:
      throw new Error(`Unknown command "${command}". Run "ledger help" for usage.`);
  }
}

const [, , command, ...args] = process.argv;
const database = initDatabase(dbPath());
try {
  run(database, command, args);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  database.db.close();
}
