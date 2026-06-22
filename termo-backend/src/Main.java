import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

//pronto

public class Main {

    private static final int PORT = 8080;
    private static final int MAX_ATTEMPTS = 6;
    private static final int WORD_LENGTH = 5;

    private static final List<String> PALAVRAS_SECRETAS = new ArrayList<>();
    private static final Set<String> DICIONARIO_VALIDO = new HashSet<>();
    private static Game GAME;

    public static void main(String[] args) throws IOException {
        carregarDicionario(); 
      
        GAME = new Game();
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/api/game", exchange -> {
            try {
                handleGame(exchange);
            } finally {
                exchange.close();
            }
        });
        server.createContext("/api/game/guess", exchange -> {
            try {
                handleGuess(exchange);
            } finally {
                exchange.close();
            }
        });
        server.createContext("/api/game/reset", exchange -> {
            try {
                handleReset(exchange);
            } finally {
                exchange.close();
            }
        });

        server.setExecutor(null);
        server.start();

        System.out.println("Termo API rodando em http://localhost:" + PORT + "/api/game");
    }

    private static void carregarDicionario() {
        try {
            List<String> linhas = Files.readAllLines(Paths.get("dicionario.txt"));
            
            for (String linha : linhas) {
                String palavraLimpa = removerAcentos(linha).trim().toUpperCase(Locale.ROOT);
                
                if (palavraLimpa.length() == WORD_LENGTH) {
                    DICIONARIO_VALIDO.add(palavraLimpa); 
                    PALAVRAS_SECRETAS.add(palavraLimpa); 
                }
            }
            System.out.println("Dicionario carregado! Total de palavras: " + PALAVRAS_SECRETAS.size());
            
        } catch (IOException e) {
            System.out.println("Aviso: Arquivo dicionario.txt não encontrado. Usando palavra de emergência.");
        
            PALAVRAS_SECRETAS.add("TERMO");
            DICIONARIO_VALIDO.add("TERMO");
        }
    }

    private static void handleGame(HttpExchange exchange) throws IOException {
        if (isOptions(exchange)) {
            sendNoContent(exchange);
            return;
        }

        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Use GET para ler o estado do jogo."));
            return;
        }

        sendJson(exchange, 200, GAME.toJson());
    }

    private static void handleGuess(HttpExchange exchange) throws IOException {
        if (isOptions(exchange)) {
            sendNoContent(exchange);
            return;
        }

        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Use POST para enviar um palpite."));
            return;
        }

        String body = readBody(exchange.getRequestBody());
        String guess = extractJsonField(body, "guess");

        if (guess == null || guess.isBlank()) {
            sendJson(exchange, 400, GAME.toJsonWithMessage("Envie um palpite no formato {\"guess\":\"PALAVRA\"}."));
            return;
        }

        GameResult result = GAME.submitGuess(guess);
        sendJson(exchange, result.statusCode, result.gameState.toJsonWithMessage(result.message));
    }

    private static void handleReset(HttpExchange exchange) throws IOException {
        if (isOptions(exchange)) {
            sendNoContent(exchange);
            return;
        }

        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Use POST para reiniciar o jogo."));
            return;
        }

        GAME.reset();
        sendJson(exchange, 200, GAME.toJsonWithMessage("Novo jogo iniciado."));
    }

    private static boolean isOptions(HttpExchange exchange) {
        return "OPTIONS".equalsIgnoreCase(exchange.getRequestMethod());
    }

    private static void sendJson(HttpExchange exchange, int statusCode, String body) throws IOException {
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "application/json; charset=utf-8");
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type");

        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);

        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private static void sendNoContent(HttpExchange exchange) throws IOException {
        Headers headers = exchange.getResponseHeaders();
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type");

        exchange.sendResponseHeaders(204, -1);
    }

    private static String jsonError(String message) {
        return "{\"message\":\"" + escapeJson(message) + "\"}";
    }

    private static String readBody(InputStream inputStream) throws IOException {
        return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
    }

    private static String extractJsonField(String json, String fieldName) {
        String search = "\"" + fieldName + "\"";
        int fieldIndex = json.indexOf(search);
        if (fieldIndex < 0) {
            return null;
        }

        int colonIndex = json.indexOf(':', fieldIndex + search.length());
        if (colonIndex < 0) {
            return null;
        }

        int firstQuoteIndex = json.indexOf('"', colonIndex + 1);
        if (firstQuoteIndex < 0) {
            return null;
        }

        int secondQuoteIndex = json.indexOf('"', firstQuoteIndex + 1);
        if (secondQuoteIndex < 0) {
            return null;
        }

        return json.substring(firstQuoteIndex + 1, secondQuoteIndex);
    }

    private static String removerAcentos(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("[^\\p{ASCII}]", "");
    }

    private static String escapeJson(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    private static StringBuilder appendField(StringBuilder json, String key, int value) {
        return json.append('"').append(key).append("\":").append(value);
    }

    private static StringBuilder appendField(StringBuilder json, String key, boolean value) {
        return json.append('"').append(key).append("\":").append(value);
    }

    private static StringBuilder appendField(StringBuilder json, String key, String value) {
        return json.append('"').append(key).append("\":\"").append(escapeJson(value)).append("\"");
    }

    private static StringBuilder appendRawField(StringBuilder json, String key, String rawJson) {
        return json.append('"').append(key).append("\":").append(rawJson);
    }

    private static final class Game {
        private final Random random = new Random();
        private final List<GuessEvaluation> guesses = new ArrayList<>();

        private String secretWord;
        private boolean finished;
        private boolean won;
        private String message;

        private Game() {
            reset();
        }

        private synchronized void reset() {
            secretWord = PALAVRAS_SECRETAS.get(random.nextInt(PALAVRAS_SECRETAS.size()));
            
            guesses.clear();
            finished = false;
            won = false;
            message = "Digite uma palavra de 5 letras e pressione enviar.";
        }
        private synchronized GameResult submitGuess(String rawGuess) {
    if (finished) {
        return new GameResult(409, this, "A rodada terminou. Reinicie para jogar de novo.");
    }

    String guess = normalizeGuess(rawGuess);


    if (guess.length() != WORD_LENGTH) {
        return new GameResult(400, this, "A palavra precisa ter exatamente 5 letras.");
    }


    if (!guess.chars().allMatch(Character::isLetter)) {
        return new GameResult(400, this, "Use apenas letras na tentativa.");
    }

    if (!DICIONARIO_VALIDO.contains(guess)) {
        return new GameResult(400, this, "Essa palavra não existe no dicionário.");
    }

    GuessEvaluation evaluation = evaluateGuess(guess);
    guesses.add(evaluation);

    if (guess.equals(secretWord)) {
        finished = true;
        won = true;
        message = "Acertou na tentativa " + guesses.size() + ".";
        return new GameResult(200, this, message);
    }

    if (guesses.size() >= MAX_ATTEMPTS) {
        finished = true;
        won = false;
        message = "Fim de jogo. A palavra era " + secretWord + ".";
        return new GameResult(200, this, message);
    }

    int remaining = MAX_ATTEMPTS - guesses.size();
    message = "Tentativa registrada. Restam " + remaining + " chances.";
    return new GameResult(200, this, message);
}

        private synchronized String toJson() {
            return toJsonWithMessage(message);
        }

        private synchronized String toJsonWithMessage(String currentMessage) {
            StringBuilder json = new StringBuilder();
            json.append('{');
            appendField(json, "wordLength", WORD_LENGTH).append(',');
            appendField(json, "maxAttempts", MAX_ATTEMPTS).append(',');
            appendField(json, "attemptsUsed", guesses.size()).append(',');
            appendField(json, "finished", finished).append(',');
            appendField(json, "won", won).append(',');
            appendField(json, "message", currentMessage).append(',');
            appendRawField(json, "board", buildBoardJson());
            json.append('}');
            return json.toString();
        }

        private synchronized String buildBoardJson() {
            StringBuilder json = new StringBuilder();
            json.append('[');

            for (int rowIndex = 0; rowIndex < MAX_ATTEMPTS; rowIndex++) {
                if (rowIndex > 0) {
                    json.append(',');
                }

                if (rowIndex < guesses.size()) {
                    json.append(guesses.get(rowIndex).toJson());
                } else {
                    json.append(emptyRowJson());
                }
            }

            json.append(']');
            return json.toString();
        }

        private String emptyRowJson() {
            StringBuilder json = new StringBuilder();
            json.append('[');
            for (int index = 0; index < WORD_LENGTH; index++) {
                if (index > 0) {
                    json.append(',');
                }
                json.append("{\"letter\":\"\",\"status\":\"empty\"}");
            }
            json.append(']');
            return json.toString();
        }

        private GuessEvaluation evaluateGuess(String guess) {
            boolean[] secretUsed = new boolean[WORD_LENGTH];
            boolean[] guessUsed = new boolean[WORD_LENGTH];
            String[] statuses = new String[WORD_LENGTH];
            Arrays.fill(statuses, "absent");

            for (int index = 0; index < WORD_LENGTH; index++) {
                if (guess.charAt(index) == secretWord.charAt(index)) {
                    statuses[index] = "correct";
                    secretUsed[index] = true;
                    guessUsed[index] = true;
                }
            }

            for (int guessIndex = 0; guessIndex < WORD_LENGTH; guessIndex++) {
                if (guessUsed[guessIndex]) {
                    continue;
                }

                for (int secretIndex = 0; secretIndex < WORD_LENGTH; secretIndex++) {
                    if (!secretUsed[secretIndex] && guess.charAt(guessIndex) == secretWord.charAt(secretIndex)) {
                        statuses[guessIndex] = "present";
                        secretUsed[secretIndex] = true;
                        break;
                    }
                }
            }

            return new GuessEvaluation(guess, statuses);
        }

        private String normalizeGuess(String guess) {
            return removerAcentos(guess == null ? "" : guess)
                    .trim()
                    .toUpperCase(Locale.ROOT)
                    .replaceAll("\\s+", "");
        }
    }

    private static final class GuessEvaluation {
        private final String guess;
        private final String[] statuses;

        private GuessEvaluation(String guess, String[] statuses) {
            this.guess = guess;
            this.statuses = statuses;
        }

        private String toJson() {
            StringBuilder json = new StringBuilder();
            json.append('[');

            for (int index = 0; index < WORD_LENGTH; index++) {
                if (index > 0) {
                    json.append(',');
                }

                json.append('{')
                        .append("\"letter\":\"")
                        .append(escapeJson(String.valueOf(guess.charAt(index))))
                        .append("\",\"status\":\"")
                        .append(statuses[index])
                        .append("\"}");
            }

            json.append(']');
            return json.toString();
        }
    }

    private static final class GameResult {
        private final int statusCode;
        private final Game gameState;
        private final String message;

        private GameResult(int statusCode, Game gameState, String message) {
            this.statusCode = statusCode;
            this.gameState = gameState;
            this.message = message;
        }
    }
}
