type FormulaValueMap = Record<string, number | string | null | undefined>;

type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

const operatorPrecedence: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2
};

export function evaluateFormula(formula: string, values: FormulaValueMap): number | null {
  const tokens = tokenizeFormula(formula);
  const output = toReversePolish(tokens);
  const stack: number[] = [];

  for (const token of output) {
    if (token.kind === "number") {
      stack.push(token.value);
      continue;
    }

    if (token.kind === "identifier") {
      const value = values[token.value];
      const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").replace(/,/g, ""));
      if (!Number.isFinite(numericValue)) return null;
      stack.push(numericValue);
      continue;
    }

    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined) return null;

    if (token.value === "+") stack.push(left + right);
    if (token.value === "-") stack.push(left - right);
    if (token.value === "*") stack.push(left * right);
    if (token.value === "/") {
      if (right === 0) return null;
      stack.push(left / right);
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) return null;
  return stack[0];
}

export function getFormulaIdentifiers(formula: string): string[] {
  return [...new Set(tokenizeFormula(formula).filter((token) => token.kind === "identifier").map((token) => token.value))];
}

export function validateFormulaSyntax(formula: string) {
  const tokens = tokenizeFormula(formula);
  if (tokens.length === 0) {
    throw new Error("Formula cannot be empty.");
  }
  toReversePolish(tokens);
}

function tokenizeFormula(formula: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < formula.length) {
    const char = formula[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9]/.test(char)) {
      let end = index + 1;
      while (end < formula.length && /[A-Za-z0-9_]/.test(formula[end])) end += 1;
      const raw = formula.slice(index, end);
      if (/[A-Za-z_]/.test(raw)) {
        tokens.push({ kind: "identifier", value: raw });
        index = end;
        continue;
      }

      while (end < formula.length && /[0-9.]/.test(formula[end])) end += 1;
      const value = Number.parseFloat(formula.slice(index, end));
      if (!Number.isFinite(value)) throw new Error("Formula contains an invalid number.");
      tokens.push({ kind: "number", value });
      index = end;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < formula.length && /[A-Za-z0-9_]/.test(formula[end])) end += 1;
      tokens.push({ kind: "identifier", value: formula.slice(index, end) });
      index = end;
      continue;
    }

    if (["+", "-", "*", "/"].includes(char)) {
      tokens.push({ kind: "operator", value: char as Token["value"] & ("+" | "-" | "*" | "/") });
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }

    throw new Error("Formula can only use metric ids, numbers, +, -, *, /, and parentheses.");
  }

  return tokens;
}

function toReversePolish(tokens: Token[]): Array<Extract<Token, { kind: "number" | "identifier" | "operator" }>> {
  const output: Array<Extract<Token, { kind: "number" | "identifier" | "operator" }>> = [];
  const operators: Array<Extract<Token, { kind: "operator" | "paren" }>> = [];
  let previous: Token | undefined;

  for (const token of tokens) {
    if (token.kind === "number" || token.kind === "identifier") {
      if (previous?.kind === "number" || previous?.kind === "identifier" || previous?.value === ")") {
        throw new Error("Formula is missing an operator.");
      }
      output.push(token);
    }

    if (token.kind === "operator") {
      if (!previous || previous.kind === "operator" || previous.value === "(") {
        throw new Error("Formula has an operator in the wrong place.");
      }

      while (operators.length) {
        const top = operators[operators.length - 1];
        if (top.kind !== "operator" || operatorPrecedence[top.value] < operatorPrecedence[token.value]) break;
        output.push(operators.pop() as Extract<Token, { kind: "operator" }>);
      }
      operators.push(token);
    }

    if (token.kind === "paren" && token.value === "(") {
      if (previous?.kind === "number" || previous?.kind === "identifier" || previous?.value === ")") {
        throw new Error("Formula is missing an operator before a parenthesis.");
      }
      operators.push(token);
    }

    if (token.kind === "paren" && token.value === ")") {
      if (!previous || previous.kind === "operator" || previous.value === "(") {
        throw new Error("Formula has an empty or invalid parenthesis.");
      }

      while (operators.length && operators[operators.length - 1].value !== "(") {
        output.push(operators.pop() as Extract<Token, { kind: "operator" }>);
      }

      if (!operators.length) throw new Error("Formula has mismatched parentheses.");
      operators.pop();
    }

    previous = token;
  }

  if (!previous || previous.kind === "operator" || previous.value === "(") {
    throw new Error("Formula is incomplete.");
  }

  while (operators.length) {
    const operator = operators.pop();
    if (!operator || operator.kind === "paren") throw new Error("Formula has mismatched parentheses.");
    output.push(operator);
  }

  return output;
}
