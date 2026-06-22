import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// vai frontend

type CellStatus = 'empty' | 'correct' | 'present' | 'absent';

type Cell = {
  letter: string;
  status: CellStatus;
};

type GameState = {
  wordLength: number;
  maxAttempts: number;
  attemptsUsed: number;
  finished: boolean;
  won: boolean;
  message: string;
  board: Cell[][];
};

const API_URL = 'http://localhost:8080/api/game';
const LETTER_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function createEmptyCell(): Cell {
  return { letter: '', status: 'empty' };
}

function createEmptyDraft(length: number) {
  return Array.from({ length }, createEmptyCell);
}

function createEmptyDraftArray(length: number) {
  return Array.from({ length }, () => '');
}

function getCellStyle(status: CellStatus, isDraft: boolean) {
  if (isDraft) {
    return styles.cellDraft;
  }

  if (status === 'correct') {
    return styles.cellCorrect;
  }

  if (status === 'present') {
    return styles.cellPresent;
  }

  if (status === 'absent') {
    return styles.cellAbsent;
  }

  return styles.cellEmpty;
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [draftGuess, setDraftGuess] = useState('');
  const [draftCells, setDraftCells] = useState<string[]>(() => createEmptyDraftArray(5));
  const [draftCursor, setDraftCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wordLength = game?.wordLength ?? 5;

  useEffect(() => {
    loadGame();
  }, []);

  useEffect(() => {
    // keep draftCells in sync if wordLength changes (rare)
    setDraftCells((prev) => {
      if (prev.length !== wordLength) return createEmptyDraftArray(wordLength);
      return prev;
    });
    setDraftCursor(0);
  }, [wordLength]);

  async function loadGame() {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      const data = (await response.json()) as GameState;
      setGame(data);
      setDraftGuess('');
      setDraftCells(createEmptyDraftArray(data.wordLength));
      setDraftCursor(0);
      setErrorMessage(null);
    } catch {
      setErrorMessage('Não consegui conectar no backend. Verifique se o Java está rodando na porta 8080.');
    } finally {
      setLoading(false);
    }
  }

  async function resetGame() {
    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/reset`, { method: 'POST' });
      const data = (await response.json()) as GameState;
      setGame(data);
      setDraftGuess('');
      setDraftCells(createEmptyDraftArray(data.wordLength));
      setDraftCursor(0);
      setErrorMessage(null);
    } catch {
      setErrorMessage('Falha ao reiniciar o jogo.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleLetterPress(letter: string) {
    if (!game || game.finished) return;

    setDraftCells((prev) => {
      const next = prev.slice();
      // place letter at cursor
      next[draftCursor] = letter;
      return next;
    });

    setDraftCursor((c) => Math.min(c + 1, wordLength - 1));
    setErrorMessage(null);
  }

  function handleBackspace() {
    setDraftCells((prev) => {
      const next = prev.slice();
      // if current cell has a letter, clear it
      if (next[draftCursor]) {
        next[draftCursor] = '';
        return next;
      }

      // otherwise move left and clear previous
      if (draftCursor > 0) {
        next[draftCursor - 1] = '';
      }
      return next;
    });

    setDraftCursor((c) => Math.max(0, c - 1));
  }

  async function handleSubmit() {
    if (!game || game.finished || submitting) {
      return;
    }
    const guess = draftCells.join('');
    if (guess.length !== wordLength || draftCells.some((c) => c === '')) {
      setErrorMessage(`Digite uma palavra com ${wordLength} letras.`);
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/guess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guess }),
      });

      const data = (await response.json()) as GameState;
      setGame(data);
        setDraftGuess('');
        setDraftCells(createEmptyDraftArray(data.wordLength));
        setDraftCursor(0);
      setErrorMessage(response.ok ? null : data.message);
    } catch {
      setErrorMessage('Falha ao enviar o palpite.');
    } finally {
      setSubmitting(false);
    }
  }

    // Keyboard handling (for web / desktop with hardware keyboard)
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        const key = e.key;

        if (key === 'ArrowLeft') {
          e.preventDefault();
          setDraftCursor((c) => Math.max(0, c - 1));
          return;
        }

        if (key === 'ArrowRight') {
          e.preventDefault();
          setDraftCursor((c) => Math.min(wordLength - 1, c + 1));
          return;
        }

        if (key === 'Backspace') {
          e.preventDefault();
          handleBackspace();
          return;
        }

        if (key === 'Enter') {
          e.preventDefault();
          handleSubmit();
          return;
        }

        if (key.length === 1 && /[a-zA-Z]/.test(key)) {
          e.preventDefault();
          handleLetterPress(key.toUpperCase());
          return;
        }
      };

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
      }
    }, [draftCursor, draftCells, game, submitting]);

  const visibleBoard = useMemo(() => {
    if (!game) {
      return [] as Cell[][];
    }

    const board = game.board.map((row) => row.map((cell) => ({ ...cell })));

    if (!game.finished && game.attemptsUsed < game.maxAttempts) {
      const draftRow = createEmptyDraft(game.wordLength);
      draftCells.forEach((letter, index) => {
        draftRow[index] = { letter, status: 'empty' };
      });
      board[game.attemptsUsed] = draftRow;
    }

    return board;
  }, [draftCells, game]);

  const statusMessage = errorMessage ?? game?.message ?? 'Carregando jogo...';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.backgroundGlowA} />
      <View style={styles.backgroundGlowB} />

      <View style={styles.shell}>

        {/* ---> O CARTÃO DE NOTIFICAÇÃO AGORA FICA AQUI <--- */}
        {statusMessage ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        ) : null}

        <View style={styles.board}>
          {(visibleBoard.length > 0 ? visibleBoard : Array.from({ length: 6 }, () => createEmptyDraft(5))).map(
            (row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.row}>
                {row.map((cell, cellIndex) => {
                  const isDraft =
                    game !== null &&
                    !game.finished &&
                    rowIndex === game.attemptsUsed &&
                    cell.status === 'empty' &&
                    cell.letter !== '';

                  const isSelected =
                    game !== null &&
                    !game.finished &&
                    rowIndex === game.attemptsUsed &&
                    cellIndex === draftCursor;

                  return (
                    <View
                      key={`cell-${rowIndex}-${cellIndex}`}
                      style={[styles.cell, getCellStyle(cell.status, isDraft), isSelected && styles.cellSelected]}
                    >
                      <Text style={styles.cellLetter}>{cell.letter}</Text>
                    </View>
                  );
                })}
              </View>
            ),
          )}
        </View>

        <View style={styles.controls}>
          <View style={styles.draftBox}>
            <Text style={styles.draftLabel}>Palpite atual</Text>
            <Text style={styles.draftValue}>
              {draftCells.map((c) => (c || '-')).join('')}
            </Text>
          </View>

          <View style={styles.keyboard}>
            {LETTER_ROWS.map((row) => (
              <View key={row} style={styles.keyboardRow}>
                {row.split('').map((letter) => (
                  <Pressable key={letter} style={styles.key} onPress={() => handleLetterPress(letter)}>
                    <Text style={styles.keyText}>{letter}</Text>
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={styles.keyboardRow}>
              <Pressable style={[styles.key, styles.keyWide]} onPress={handleBackspace}>
                <Text style={styles.keyText}>APAGAR</Text>
              </Pressable>

              <Pressable
                style={[styles.key, styles.keyWide, styles.keyAccent]}
                onPress={handleSubmit}
                disabled={submitting || loading || !game || game.finished}
              >
                <Text style={styles.keyText}>{submitting ? 'ENVIANDO...' : 'JOGAR'}</Text>
              </Pressable>

              <Pressable style={[styles.key, styles.keyWide]} onPress={resetGame} disabled={submitting}>
                <Text style={styles.keyText}>NOVO JOGO</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  backgroundGlowA: {
    position: 'absolute',
    top: -140,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 200,
    backgroundColor: 'rgba(80, 170, 255, 0.18)',
  },
  backgroundGlowB: {
    position: 'absolute',
    bottom: -120,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 240,
    backgroundColor: 'rgba(255, 174, 97, 0.14)',
  },
  shell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 24,
    gap: 18,
  },
  header: {
    gap: 10,
  },
  kicker: {
    color: '#8fd3ff',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    color: '#f5f8ff',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: '#b3bfd6',
    fontSize: 15,
    lineHeight: 22,
  },
  statusCard: {
    backgroundColor: 'rgba(10, 16, 35, 0.78)',
    borderColor: 'rgba(143, 211, 255, 0.18)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  statusText: {
    color: '#f5f8ff',
    fontSize: 15,
    fontWeight: '700',
  },
  metaText: {
    color: '#8fa0bb',
    fontSize: 13,
  },
  board: {
    gap: 10,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  cell: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cellSelected: {
    borderColor: '#8fd3ff',
    borderWidth: 2,
  },
  cellEmpty: {
    backgroundColor: '#10192f',
    borderColor: 'rgba(190, 201, 222, 0.22)',
  },
  cellDraft: {
    backgroundColor: '#17233f',
    borderColor: '#8fd3ff',
  },
  cellCorrect: {
    backgroundColor: '#2d9c5f',
    borderColor: '#67dc8e',
  },
  cellPresent: {
    backgroundColor: '#c38a27',
    borderColor: '#f2c45a',
  },
  cellAbsent: {
    backgroundColor: '#4b5568',
    borderColor: '#6c7687',
  },
  cellLetter: {
    color: '#f7fbff',
    fontSize: 24,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  controls: {
    gap: 14,
    marginTop: 'auto',
  },
  draftBox: {
    backgroundColor: 'rgba(10, 16, 35, 0.7)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(143, 211, 255, 0.16)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftLabel: {
    color: '#8fa0bb',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  draftValue: {
    color: '#f5f8ff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
  keyboard: {
    gap: 10,
  },
  keyboardRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  key: {
    minWidth: 30,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#18233c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyWide: {
    minWidth: 104,
  },
  keyAccent: {
    backgroundColor: '#1f4f8f',
    borderColor: '#5ea1ff',
  },
  keyText: {
    color: '#f5f8ff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
