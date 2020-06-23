// Ported from https://github.com/bendrucker/postgres-array
// The MIT License (MIT)
//
// Copyright (c) Ben Drucker <bvdrucker@gmail.com> (bendrucker.me)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
export function parseArray(source: string, transform: Function | undefined) {
  return new ArrayParser(source, transform).parse();
}

class ArrayParser {
  source: string;
  transform: Function;
  position: number = 0;
  entries: Array<unknown> = [];
  recorded: Array<unknown> = [];
  dimension: number = 0;

  constructor(source: string, transform: Function | undefined) {
    this.source = source;
    this.transform = transform || identity;
  }

  isEof(): boolean {
    return this.position >= this.source.length;
  }

  nextCharacter() {
    const character = this.source[this.position++];
    if (character === "\\") {
      return {
        value: this.source[this.position++],
        escaped: true,
      };
    }
    return {
      value: character,
      escaped: false,
    };
  }

  record(character: string): void {
    this.recorded.push(character);
  }

  newEntry(includeEmpty: boolean = false): void {
    let entry;
    if (this.recorded.length > 0 || includeEmpty) {
      entry = this.recorded.join("");
      if (entry === "NULL" && !includeEmpty) {
        entry = null;
      }
      if (entry !== null) entry = this.transform(entry);
      this.entries.push(entry);
      this.recorded = [];
    }
  }

  consumeDimensions(): void {
    if (this.source[0] === "[") {
      while (!this.isEof()) {
        let char = this.nextCharacter();
        if (char.value === "=") break;
      }
    }
  }

  parse(nested?: boolean): Array<unknown> {
    let character, parser, quote;
    this.consumeDimensions();
    while (!this.isEof()) {
      character = this.nextCharacter();
      if (character.value === "{" && !quote) {
        this.dimension++;
        if (this.dimension > 1) {
          parser = new ArrayParser(
            this.source.substr(this.position - 1),
            this.transform,
          );
          this.entries.push(parser.parse(true));
          this.position += parser.position - 2;
        }
      } else if (character.value === "}" && !quote) {
        this.dimension--;
        if (!this.dimension) {
          this.newEntry();
          if (nested) return this.entries;
        }
      } else if (character.value === '"' && !character.escaped) {
        if (quote) this.newEntry(true);
        quote = !quote;
      } else if (character.value === "," && !quote) {
        this.newEntry();
      } else {
        this.record(character.value);
      }
    }
    if (this.dimension !== 0) {
      throw new Error("array dimension not balanced");
    }
    return this.entries;
  }
}

function identity(value: string): string {
  return value;
}
