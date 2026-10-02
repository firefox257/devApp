#pragma once

#include <iostream>
#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <unordered_set>
#include <cmath>
#include <cstdlib>
#include <cctype>

// ============================================================================
// 1. AST Definitions (RTTI-free with explicit type tags)
// ============================================================================

enum class NodeType {
    Program, VarDecl, Identifier, Literal, BinaryOp, UnaryOp, Update,
    Assignment, Conditional, Block, If, For, ForIn, While, DoWhile,
    Switch, Return, Break, Continue, FunctionDef, Call, MemberAccess, 
    ArrayIndex, TokenDirective, ArrayLiteral, ObjectLiteral, TypeOf
};

struct ASTNode { 
    virtual ~ASTNode() = default; 
    NodeType type;
    ASTNode(NodeType t) : type(t) {}
};
using ASTPtr = std::shared_ptr<ASTNode>;

template <typename T>
std::shared_ptr<T> ast_cast(const ASTPtr& ptr, NodeType expected) {
    if (ptr && ptr->type == expected) {
        return std::static_pointer_cast<T>(ptr);
    }
    return nullptr;
}

struct ProgramNode : ASTNode { std::vector<ASTPtr> statements; ProgramNode() : ASTNode(NodeType::Program) {} };
struct VarDeclNode : ASTNode { 
    std::string name; 
    ASTPtr initializer; 
    bool isToken;
    VarDeclNode(std::string n, ASTPtr i, bool t = false) : ASTNode(NodeType::VarDecl), name(std::move(n)), initializer(std::move(i)), isToken(t) {} 
};
struct IdentifierNode : ASTNode { std::string name; IdentifierNode(std::string n) : ASTNode(NodeType::Identifier), name(std::move(n)) {} };
struct LiteralNode : ASTNode { std::string type, value; char quoteType; LiteralNode(std::string t, std::string v, char q) : ASTNode(NodeType::Literal), type(std::move(t)), value(std::move(v)), quoteType(q) {} };
struct BinaryOpNode : ASTNode { ASTPtr left, right; std::string op; BinaryOpNode(ASTPtr l, std::string o, ASTPtr r) : ASTNode(NodeType::BinaryOp), left(std::move(l)), op(std::move(o)), right(std::move(r)) {} };
struct UnaryOpNode : ASTNode { std::string op; ASTPtr operand; UnaryOpNode(std::string o, ASTPtr opnd) : ASTNode(NodeType::UnaryOp), op(std::move(o)), operand(std::move(opnd)) {} };
struct UpdateNode : ASTNode { ASTPtr target; std::string op; bool isPrefix; UpdateNode(ASTPtr t, std::string o, bool p) : ASTNode(NodeType::Update), target(std::move(t)), op(std::move(o)), isPrefix(p) {} };
struct AssignmentNode : ASTNode { ASTPtr left, right; std::string op; AssignmentNode(ASTPtr l, std::string o, ASTPtr r) : ASTNode(NodeType::Assignment), left(std::move(l)), op(std::move(o)), right(std::move(r)) {} };
struct ConditionalNode : ASTNode { ASTPtr condition, trueExpr, falseExpr; ConditionalNode(ASTPtr c, ASTPtr t, ASTPtr f) : ASTNode(NodeType::Conditional), condition(std::move(c)), trueExpr(std::move(t)), falseExpr(std::move(f)) {} };
struct BlockNode : ASTNode { std::vector<ASTPtr> statements; BlockNode() : ASTNode(NodeType::Block) {} };
struct IfNode : ASTNode { ASTPtr condition, thenBranch, elseBranch; IfNode(ASTPtr c, ASTPtr t, ASTPtr e) : ASTNode(NodeType::If), condition(std::move(c)), thenBranch(std::move(t)), elseBranch(std::move(e)) {} };
struct ForNode : ASTNode { ASTPtr init, condition, increment, body; ForNode(ASTPtr i, ASTPtr c, ASTPtr inc, ASTPtr b) : ASTNode(NodeType::For), init(std::move(i)), condition(std::move(c)), increment(std::move(inc)), body(std::move(b)) {} };
struct ForInNode : ASTNode { std::string varName; ASTPtr iterable, body; ForInNode(std::string v, ASTPtr i, ASTPtr b) : ASTNode(NodeType::ForIn), varName(std::move(v)), iterable(std::move(i)), body(std::move(b)) {} };
struct WhileNode : ASTNode { ASTPtr condition, body; WhileNode(ASTPtr c, ASTPtr b) : ASTNode(NodeType::While), condition(std::move(c)), body(std::move(b)) {} };
struct DoWhileNode : ASTNode { ASTPtr body, condition; DoWhileNode(ASTPtr b, ASTPtr c) : ASTNode(NodeType::DoWhile), body(std::move(b)), condition(std::move(c)) {} };
struct SwitchNode : ASTNode { ASTPtr expression; std::vector<std::pair<ASTPtr, ASTPtr>> cases; ASTPtr defaultCase; SwitchNode(ASTPtr e, std::vector<std::pair<ASTPtr, ASTPtr>> c, ASTPtr d) : ASTNode(NodeType::Switch), expression(std::move(e)), cases(std::move(c)), defaultCase(std::move(d)) {} };
struct ReturnNode : ASTNode { ASTPtr value; ReturnNode(ASTPtr v) : ASTNode(NodeType::Return), value(std::move(v)) {} };
struct BreakNode : ASTNode { BreakNode() : ASTNode(NodeType::Break) {} };
struct ContinueNode : ASTNode { ContinueNode() : ASTNode(NodeType::Continue) {} };
struct FunctionDefNode : ASTNode { std::vector<std::string> params; ASTPtr body; FunctionDefNode(std::vector<std::string> p, ASTPtr b) : ASTNode(NodeType::FunctionDef), params(std::move(p)), body(std::move(b)) {} };
struct CallNode : ASTNode { ASTPtr callee; std::vector<ASTPtr> args; CallNode(ASTPtr c, std::vector<ASTPtr> a) : ASTNode(NodeType::Call), callee(std::move(c)), args(std::move(a)) {} };
struct MemberAccessNode : ASTNode { ASTPtr object; std::string property; MemberAccessNode(ASTPtr o, std::string p) : ASTNode(NodeType::MemberAccess), object(std::move(o)), property(std::move(p)) {} };
struct ArrayIndexNode : ASTNode { ASTPtr array, index; ArrayIndexNode(ASTPtr a, ASTPtr i) : ASTNode(NodeType::ArrayIndex), array(std::move(a)), index(std::move(i)) {} };
struct TokenDirectiveNode : ASTNode { std::string functionName; TokenDirectiveNode(std::string f) : ASTNode(NodeType::TokenDirective), functionName(std::move(f)) {} };
struct ArrayLiteralNode : ASTNode { std::vector<ASTPtr> elements; ArrayLiteralNode() : ASTNode(NodeType::ArrayLiteral) {} };
struct ObjectLiteralNode : ASTNode { std::vector<std::pair<std::string, ASTPtr>> properties; ObjectLiteralNode() : ASTNode(NodeType::ObjectLiteral) {} };
struct TypeOfNode : ASTNode { ASTPtr operand; TypeOfNode(ASTPtr o) : ASTNode(NodeType::TypeOf), operand(std::move(o)) {} };

// ============================================================================
// 2. Lexer
// ============================================================================

enum class TokenType {
    Var, If, Else, For, While, Do, Switch, Case, Default, Return, Break, Continue, In, TypeOf,
    True, False, Undefined,
    Identifier, Integer, Float, StringSingle, StringDouble, StringBacktick,
    Plus, Minus, Star, Slash, Percent, DoubleStar, PlusPlus, MinusMinus, Arrow,
    Eq, EqEq, NotEq, Gt, GtEq, Lt, LtEq,
    And, Or, Not, BitAnd, BitOr, BitXor, BitNot, LShift, RShift,
    PlusEq, MinusEq, StarEq, SlashEq, PercentEq, LShiftEq, RShiftEq, BitAndEq, BitXorEq, BitOrEq,
    LParen, RParen, LBrace, RBrace, LBracket, RBracket, Comma, Dot, Colon, Question, Semicolon,
    HashToken, EOF_
};

struct Token { TokenType type; std::string value; int line; };

class Lexer {
    std::string source;
    size_t pos = 0;
    int line = 1;
    size_t markPos = 0;
    int markLine = 1;

    char peek() { return pos < source.size() ? source[pos] : '\0'; }
    char peekNext() { return pos + 1 < source.size() ? source[pos + 1] : '\0'; }
    char advance() { char c = peek(); if (c == '\n') line++; pos++; return c; }
    bool match(char expected) { if (peek() == expected) { advance(); return true; } return false; }

public:
    Lexer(const std::string& src) : source(src) {}
    void mark() { markPos = pos; markLine = line; }
    void reset() { pos = markPos; line = markLine; }

    Token nextToken() {
        while (std::isspace(static_cast<unsigned char>(peek()))) { if (peek() == '\n') line++; advance(); }
        if (pos >= source.size()) return {TokenType::EOF_, "", line};

        if (match('/')) {
            if (match('/')) { while (peek() != '\n' && peek() != '\0') advance(); return nextToken(); }
            if (match('*')) { while (!(match('*') && match('/'))) { if (pos >= source.size()) return {TokenType::EOF_, "Unterminated comment", line}; advance(); } return nextToken(); }
            if (match('=')) { return {TokenType::SlashEq, "/=", line}; }
            return {TokenType::Slash, "/", line};
        }

        if (std::isalpha(static_cast<unsigned char>(peek())) || peek() == '_') {
            std::string id;
            while (std::isalnum(static_cast<unsigned char>(peek())) || peek() == '_') id += advance();
            if (id == "var") return {TokenType::Var, id, line};
            if (id == "if") return {TokenType::If, id, line};
            if (id == "else") return {TokenType::Else, id, line};
            if (id == "for") return {TokenType::For, id, line};
            if (id == "while") return {TokenType::While, id, line};
            if (id == "do") return {TokenType::Do, id, line};
            if (id == "switch") return {TokenType::Switch, id, line};
            if (id == "case") return {TokenType::Case, id, line};
            if (id == "default") return {TokenType::Default, id, line};
            if (id == "return") return {TokenType::Return, id, line};
            if (id == "break") return {TokenType::Break, id, line};
            if (id == "continue") return {TokenType::Continue, id, line};
            if (id == "in") return {TokenType::In, id, line};
            if (id == "typeof") return {TokenType::TypeOf, id, line};
            if (id == "true") return {TokenType::True, id, line};
            if (id == "false") return {TokenType::False, id, line};
            if (id == "undefined") return {TokenType::Undefined, id, line};
            return {TokenType::Identifier, id, line};
        }

        if (std::isdigit(static_cast<unsigned char>(peek()))) {
            std::string num;
            bool isFloat = false;
            
            if (peek() == '0' && pos + 1 < source.size()) {
                char next = peekNext();
                if (next == 'x' || next == 'X') {
                    num += advance(); num += advance();
                    while (std::isxdigit(static_cast<unsigned char>(peek()))) num += advance();
                    return {TokenType::Integer, num, line};
                }
                if (next == 'b' || next == 'B') {
                    num += advance(); num += advance();
                    while (peek() == '0' || peek() == '1') num += advance();
                    return {TokenType::Integer, num, line};
                }
                if (next == 'o' || next == 'O') {
                    num += advance(); num += advance();
                    while (peek() >= '0' && peek() <= '7') num += advance();
                    return {TokenType::Integer, num, line};
                }
            }
            
            while (std::isdigit(static_cast<unsigned char>(peek())) || peek() == '.') {
                if (peek() == '.') { if (isFloat) break; isFloat = true; }
                num += advance();
            }
            return {isFloat ? TokenType::Float : TokenType::Integer, num, line};
        }

        if (peek() == '"' || peek() == '\'' || peek() == '`') {
            char quote = advance();
            TokenType type = (quote == '"') ? TokenType::StringDouble :
                             (quote == '\'') ? TokenType::StringSingle : TokenType::StringBacktick;
            std::string str;
            while (peek() != quote && peek() != '\0') {
                if (peek() == '\\') { 
                    advance(); 
                    char c = advance(); 
                    if (c == 'n') str += '\n'; 
                    else if (c == 't') str += '\t'; 
                    else if (c == 'r') str += '\r';
                    else if (c == '\\') str += '\\';
                    else if (c == '"') str += '"';
                    else if (c == '\'') str += '\'';
                    else str += c; 
                } else {
                    str += advance();
                }
            }
            if (peek() == quote) advance();
            return {type, str, line};
        }

        if (match('=')) { if (match('=')) return {TokenType::EqEq, "==", line}; return {TokenType::Eq, "=", line}; }
        if (match('!')) { if (match('=')) return {TokenType::NotEq, "!=", line}; return {TokenType::Not, "!", line}; }
        if (match('<')) { if (match('=')) return {TokenType::LtEq, "<=", line}; if (match('<')) { if (match('=')) return {TokenType::LShiftEq, "<<=", line}; return {TokenType::LShift, "<<", line}; } return {TokenType::Lt, "<", line}; }
        if (match('>')) { if (match('=')) return {TokenType::GtEq, ">=", line}; if (match('>')) { if (match('=')) return {TokenType::RShiftEq, ">>=", line}; return {TokenType::RShift, ">>", line}; } return {TokenType::Gt, ">", line}; }
        if (match('+')) { if (match('+')) return {TokenType::PlusPlus, "++", line}; if (match('=')) return {TokenType::PlusEq, "+=", line}; return {TokenType::Plus, "+", line}; }
        if (match('-')) { if (match('-')) return {TokenType::MinusMinus, "--", line}; if (match('=')) return {TokenType::MinusEq, "-=", line}; if (match('>')) return {TokenType::Arrow, "->", line}; return {TokenType::Minus, "-", line}; }
        if (match('*')) { if (match('*')) return {TokenType::DoubleStar, "**", line}; if (match('=')) return {TokenType::StarEq, "*=", line}; return {TokenType::Star, "*", line}; }
        if (match('%')) { if (match('=')) return {TokenType::PercentEq, "%=", line}; return {TokenType::Percent, "%", line}; }
        if (match('&')) { if (match('&')) return {TokenType::And, "&&", line}; if (match('=')) return {TokenType::BitAndEq, "&=", line}; return {TokenType::BitAnd, "&", line}; }
        if (match('|')) { if (match('|')) return {TokenType::Or, "||", line}; if (match('=')) return {TokenType::BitOrEq, "|=", line}; return {TokenType::BitOr, "|", line}; }
        if (match('^')) { if (match('=')) return {TokenType::BitXorEq, "^=", line}; return {TokenType::BitXor, "^", line}; }
        if (match('~')) return {TokenType::BitNot, "~", line};
        
        if (match('#')) { 
            std::string id; 
            while (std::isalnum(static_cast<unsigned char>(peek())) || peek() == '_') id += advance(); 
            if (id == "token") return {TokenType::HashToken, "#token", line}; 
            return {TokenType::EOF_, "Unknown directive: " + id, line}; 
        }

        char c = advance();
        switch (c) {
            case '(': return {TokenType::LParen, "(", line};
            case ')': return {TokenType::RParen, ")", line};
            case '{': return {TokenType::LBrace, "{", line};
            case '}': return {TokenType::RBrace, "}", line};
            case '[': return {TokenType::LBracket, "[", line};
            case ']': return {TokenType::RBracket, "]", line};
            case ',': return {TokenType::Comma, ",", line};
            case '.': return {TokenType::Dot, ".", line};
            case ':': return {TokenType::Colon, ":", line};
            case '?': return {TokenType::Question, "?", line};
            case ';': return {TokenType::Semicolon, ";", line};
        }
        return {TokenType::EOF_, std::string("Unexpected character: ") + c, line};
    }
};

// ============================================================================
// 3. Parser
// ============================================================================

struct ParseResult {
    ASTPtr ast;
    bool is_error;
    std::string error_msg;
    static ParseResult make(ASTPtr a) { return {a, false, ""}; }
    static ParseResult error(const std::string& msg) { return {nullptr, true, msg}; }
};

class Parser {
    Lexer lexer;
    Token currentToken, nextToken;
    std::string error_msg;

    void advance() { currentToken = nextToken; nextToken = lexer.nextToken(); }
    bool expect(TokenType type) {
        if (currentToken.type != type) {
            error_msg = "Expected token but got '" + currentToken.value + "' at line " + std::to_string(currentToken.line);
            return false;
        }
        advance();
        return true;
    }
    bool has_error() const { return !error_msg.empty(); }

public:
    Parser(const std::string& src) : lexer(src) { advance(); advance(); }

    ParseResult parseProgram() {
        auto prog = std::make_shared<ProgramNode>();
        while (currentToken.type != TokenType::EOF_ && !has_error()) {
            auto stmt = parseStatement();
            if (has_error()) return ParseResult::error(error_msg);
            if (stmt) prog->statements.push_back(stmt);
        }
        if (has_error()) return ParseResult::error(error_msg);
        return ParseResult::make(prog);
    }

    ASTPtr parseStatement() {
        if (has_error()) return nullptr;
        if (currentToken.type == TokenType::Var) {
            advance();
            std::string name = currentToken.value;
            if (!expect(TokenType::Identifier)) return nullptr;
            ASTPtr init = nullptr;
            if (currentToken.type == TokenType::Eq) { 
                advance(); 
                init = parseExpression(); 
                if (has_error()) return nullptr; 
            }
            if (currentToken.type == TokenType::Semicolon) advance();
            return std::make_shared<VarDeclNode>(name, init, false);
        }
        if (currentToken.type == TokenType::HashToken) {
            advance();
            if (currentToken.type == TokenType::Var) {
                advance();
                std::string name = currentToken.value;
                if (!expect(TokenType::Identifier)) return nullptr;
                if (!expect(TokenType::Eq)) return nullptr;
                ASTPtr init = parseExpression();
                if (has_error()) return nullptr;
                if (!expect(TokenType::Semicolon)) return nullptr;
                return std::make_shared<VarDeclNode>(name, init, true);
            } else {
                std::string funcName = currentToken.value;
                if (!expect(TokenType::Identifier)) return nullptr;
                if (!expect(TokenType::Semicolon)) return nullptr;
                return std::make_shared<TokenDirectiveNode>(funcName);
            }
        }
        if (currentToken.type == TokenType::If) {
            advance(); 
            if (!expect(TokenType::LParen)) return nullptr;
            auto cond = parseExpression(); if (has_error()) return nullptr;
            if (!expect(TokenType::RParen)) return nullptr;
            auto thenBranch = parseStatement(); if (has_error()) return nullptr;
            ASTPtr elseBranch = nullptr;
            if (currentToken.type == TokenType::Else) { 
                advance(); 
                elseBranch = parseStatement(); if (has_error()) return nullptr; 
            }
            return std::make_shared<IfNode>(cond, thenBranch, elseBranch);
        }
        if (currentToken.type == TokenType::For) {
            advance(); 
            if (!expect(TokenType::LParen)) return nullptr;
            if (currentToken.type == TokenType::Var) {
                advance();
                std::string varName = currentToken.value;
                if (!expect(TokenType::Identifier)) return nullptr;
                if (currentToken.type == TokenType::In) {
                    advance(); 
                    auto iterable = parseExpression(); if (has_error()) return nullptr;
                    if (!expect(TokenType::RParen)) return nullptr;
                    return std::make_shared<ForInNode>(varName, iterable, parseStatement());
                } else {
                    ASTPtr initExpr = nullptr;
                    if (currentToken.type == TokenType::Eq) { 
                        advance(); 
                        initExpr = parseExpression(); if (has_error()) return nullptr; 
                    }
                    if (!expect(TokenType::Semicolon)) return nullptr;
                    
                    ASTPtr cond = nullptr;
                    if (currentToken.type != TokenType::Semicolon) {
                        cond = parseExpression(); if (has_error()) return nullptr;
                    }
                    if (!expect(TokenType::Semicolon)) return nullptr;
                    
                    ASTPtr inc = nullptr;
                    if (currentToken.type != TokenType::RParen) {
                        inc = parseExpression(); if (has_error()) return nullptr;
                    }
                    if (!expect(TokenType::RParen)) return nullptr;
                    
                    ASTPtr initNode = std::make_shared<VarDeclNode>(varName, initExpr, false);
                    return std::make_shared<ForNode>(initNode, cond, inc, parseStatement());
                }
            } else {
                ASTPtr init = nullptr;
                if (currentToken.type != TokenType::Semicolon) {
                    init = parseExpression(); if (has_error()) return nullptr;
                }
                if (!expect(TokenType::Semicolon)) return nullptr;
                
                ASTPtr cond = nullptr;
                if (currentToken.type != TokenType::Semicolon) {
                    cond = parseExpression(); if (has_error()) return nullptr;
                }
                if (!expect(TokenType::Semicolon)) return nullptr;
                
                ASTPtr inc = nullptr;
                if (currentToken.type != TokenType::RParen) {
                    inc = parseExpression(); if (has_error()) return nullptr;
                }
                if (!expect(TokenType::RParen)) return nullptr;
                
                return std::make_shared<ForNode>(init, cond, inc, parseStatement());
            }
        }
        if (currentToken.type == TokenType::While) {
            advance(); 
            if (!expect(TokenType::LParen)) return nullptr; 
            auto cond = parseExpression(); if (has_error()) return nullptr; 
            if (!expect(TokenType::RParen)) return nullptr;
            return std::make_shared<WhileNode>(cond, parseStatement());
        }
        if (currentToken.type == TokenType::Do) {
            advance(); 
            auto body = parseStatement(); if (has_error()) return nullptr; 
            if (!expect(TokenType::While)) return nullptr; 
            if (!expect(TokenType::LParen)) return nullptr;
            auto cond = parseExpression(); if (has_error()) return nullptr; 
            if (!expect(TokenType::RParen)) return nullptr; 
            if (!expect(TokenType::Semicolon)) return nullptr;
            return std::make_shared<DoWhileNode>(body, cond);
        }
        if (currentToken.type == TokenType::Switch) {
            advance(); 
            if (!expect(TokenType::LParen)) return nullptr; 
            auto expr = parseExpression(); if (has_error()) return nullptr; 
            if (!expect(TokenType::RParen)) return nullptr; 
            if (!expect(TokenType::LBrace)) return nullptr;
            
            std::vector<std::pair<ASTPtr, ASTPtr>> cases; 
            ASTPtr defaultCase = nullptr;

            while (currentToken.type != TokenType::RBrace && currentToken.type != TokenType::EOF_ && !has_error()) {
                if (currentToken.type == TokenType::Case) {
                    advance(); 
                    auto caseExpr = parseExpression(); if (has_error()) return nullptr; 
                    if (!expect(TokenType::Colon)) return nullptr;
                    
                    std::vector<ASTPtr> stmts;
                    while (currentToken.type != TokenType::Case && 
                           currentToken.type != TokenType::Default && 
                           currentToken.type != TokenType::RBrace && 
                           currentToken.type != TokenType::EOF_ && !has_error()) {
                        auto stmt = parseStatement();
                        if (has_error()) return nullptr;
                        if (stmt) stmts.push_back(stmt);
                    }
                    
                    ASTPtr bodyNode = nullptr;
                    if (stmts.size() == 1) bodyNode = stmts[0];
                    else if (stmts.size() > 1) {
                        auto block = std::make_shared<BlockNode>();
                        block->statements = stmts;
                        bodyNode = block;
                    } else {
                        bodyNode = std::make_shared<BlockNode>();
                    }
                    cases.push_back({caseExpr, bodyNode});
                } else if (currentToken.type == TokenType::Default) {
                    advance(); 
                    if (!expect(TokenType::Colon)) return nullptr; 
                    
                    std::vector<ASTPtr> stmts;
                    while (currentToken.type != TokenType::Case && 
                           currentToken.type != TokenType::Default && 
                           currentToken.type != TokenType::RBrace && 
                           currentToken.type != TokenType::EOF_ && !has_error()) {
                        auto stmt = parseStatement();
                        if (has_error()) return nullptr;
                        if (stmt) stmts.push_back(stmt);
                    }
                    
                    ASTPtr bodyNode = nullptr;
                    if (stmts.size() == 1) bodyNode = stmts[0];
                    else if (stmts.size() > 1) {
                        auto block = std::make_shared<BlockNode>();
                        block->statements = stmts;
                        bodyNode = block;
                    } else {
                        bodyNode = std::make_shared<BlockNode>();
                    }
                    defaultCase = bodyNode;
                } else { 
                    error_msg = "Expected case or default in switch at line " + std::to_string(currentToken.line);
                    return nullptr; 
                }
            }
            if (!expect(TokenType::RBrace)) return nullptr;
            return std::make_shared<SwitchNode>(expr, cases, defaultCase);
        }
        if (currentToken.type == TokenType::Return) {
            advance(); 
            ASTPtr val = nullptr;
            if (currentToken.type != TokenType::Semicolon && currentToken.type != TokenType::RBrace && currentToken.type != TokenType::EOF_) { 
                val = parseExpression(); if (has_error()) return nullptr; 
            }
            if (currentToken.type == TokenType::Semicolon) advance();
            return std::make_shared<ReturnNode>(val);
        }
        if (currentToken.type == TokenType::Break) {
            advance();
            if (currentToken.type == TokenType::Semicolon) advance();
            return std::make_shared<BreakNode>();
        }
        if (currentToken.type == TokenType::Continue) {
            advance();
            if (currentToken.type == TokenType::Semicolon) advance();
            return std::make_shared<ContinueNode>();
        }
        if (currentToken.type == TokenType::LBrace) {
            advance(); 
            auto block = std::make_shared<BlockNode>();
            while (currentToken.type != TokenType::RBrace && currentToken.type != TokenType::EOF_ && !has_error()) {
                auto stmt = parseStatement();
                if (has_error()) return nullptr;
                if (stmt) block->statements.push_back(stmt);
            }
            if (!expect(TokenType::RBrace)) return nullptr; 
            return block;
        }
        auto expr = parseExpression();
        if (has_error()) return nullptr;
        if (currentToken.type == TokenType::Semicolon) advance();
        return expr;
    }

    ASTPtr parseExpression() { return parseAssignment(); }

    ASTPtr parseAssignment() {
        auto left = parseConditional();
        if (has_error()) return nullptr;
        if (currentToken.type == TokenType::Eq || currentToken.type == TokenType::PlusEq || currentToken.type == TokenType::MinusEq ||
            currentToken.type == TokenType::StarEq || currentToken.type == TokenType::SlashEq || currentToken.type == TokenType::PercentEq ||
            currentToken.type == TokenType::LShiftEq || currentToken.type == TokenType::RShiftEq || currentToken.type == TokenType::BitAndEq ||
            currentToken.type == TokenType::BitXorEq || currentToken.type == TokenType::BitOrEq) {
            std::string op = currentToken.value; advance();
            return std::make_shared<AssignmentNode>(left, op, parseAssignment());
        }
        return left;
    }

    ASTPtr parseConditional() {
        auto expr = parseLogicalOr();
        if (has_error()) return nullptr;
        if (currentToken.type == TokenType::Question) {
            advance(); auto trueExpr = parseExpression(); if (has_error()) return nullptr;
            if (!expect(TokenType::Colon)) return nullptr;
            return std::make_shared<ConditionalNode>(expr, trueExpr, parseConditional());
        }
        return expr;
    }

    ASTPtr parseLogicalOr() { auto left = parseLogicalAnd(); while (!has_error() && currentToken.type == TokenType::Or) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseLogicalAnd()); } return left; }
    ASTPtr parseLogicalAnd() { auto left = parseBitwiseOr(); while (!has_error() && currentToken.type == TokenType::And) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseBitwiseOr()); } return left; }
    ASTPtr parseBitwiseOr() { auto left = parseBitwiseXor(); while (!has_error() && currentToken.type == TokenType::BitOr) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseBitwiseXor()); } return left; }
    ASTPtr parseBitwiseXor() { auto left = parseBitwiseAnd(); while (!has_error() && currentToken.type == TokenType::BitXor) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseBitwiseAnd()); } return left; }
    ASTPtr parseBitwiseAnd() { auto left = parseEquality(); while (!has_error() && currentToken.type == TokenType::BitAnd) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseEquality()); } return left; }
    ASTPtr parseEquality() { auto left = parseRelational(); while (!has_error() && (currentToken.type == TokenType::EqEq || currentToken.type == TokenType::NotEq)) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseRelational()); } return left; }
    ASTPtr parseRelational() { auto left = parseShift(); while (!has_error() && (currentToken.type == TokenType::Lt || currentToken.type == TokenType::LtEq || currentToken.type == TokenType::Gt || currentToken.type == TokenType::GtEq)) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseShift()); } return left; }
    ASTPtr parseShift() { auto left = parseAdditive(); while (!has_error() && (currentToken.type == TokenType::LShift || currentToken.type == TokenType::RShift)) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseAdditive()); } return left; }
    ASTPtr parseAdditive() { auto left = parseMultiplicative(); while (!has_error() && (currentToken.type == TokenType::Plus || currentToken.type == TokenType::Minus)) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseMultiplicative()); } return left; }
    ASTPtr parseMultiplicative() { auto left = parseExponential(); while (!has_error() && (currentToken.type == TokenType::Star || currentToken.type == TokenType::Slash || currentToken.type == TokenType::Percent)) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseExponential()); } return left; }
    ASTPtr parseExponential() { auto left = parseUnary(); while (!has_error() && currentToken.type == TokenType::DoubleStar) { std::string op = currentToken.value; advance(); left = std::make_shared<BinaryOpNode>(left, op, parseUnary()); } return left; }

    ASTPtr parseUnary() {
        if (has_error()) return nullptr;
        if (currentToken.type == TokenType::Not || currentToken.type == TokenType::Minus || currentToken.type == TokenType::BitNot || currentToken.type == TokenType::TypeOf) {
            std::string op = currentToken.value; advance();
            if (op == "typeof") return std::make_shared<TypeOfNode>(parseUnary());
            return std::make_shared<UnaryOpNode>(op, parseUnary());
        }
        if (currentToken.type == TokenType::PlusPlus || currentToken.type == TokenType::MinusMinus) {
            std::string op = currentToken.value; advance();
            return std::make_shared<UpdateNode>(parseUnary(), op, true);
        }
        return parsePostfix();
    }

    ASTPtr parsePostfix() {
        auto expr = parsePrimary();
        if (has_error()) return nullptr;
        while (true) {
            if (currentToken.type == TokenType::Dot) { 
                advance(); 
                std::string prop = currentToken.value;
                if (!expect(TokenType::Identifier)) return nullptr; 
                expr = std::make_shared<MemberAccessNode>(expr, prop); 
            }
            else if (currentToken.type == TokenType::LBracket) { 
                advance(); 
                auto index = parseExpression(); if (has_error()) return nullptr; 
                if (!expect(TokenType::RBracket)) return nullptr; 
                expr = std::make_shared<ArrayIndexNode>(expr, index); 
            }
            else if (currentToken.type == TokenType::LParen) {
                advance(); std::vector<ASTPtr> args;
                if (currentToken.type != TokenType::RParen) {
                    args.push_back(parseExpression()); if (has_error()) return nullptr;
                    while (currentToken.type == TokenType::Comma) { 
                        advance(); 
                        args.push_back(parseExpression()); if (has_error()) return nullptr; 
                    }
                }
                if (!expect(TokenType::RParen)) return nullptr; 
                expr = std::make_shared<CallNode>(expr, args);
            }
            else if (currentToken.type == TokenType::PlusPlus || currentToken.type == TokenType::MinusMinus) {
                std::string op = currentToken.value; advance(); expr = std::make_shared<UpdateNode>(expr, op, false);
            }
            else break;
        }
        return expr;
    }

    ASTPtr parsePrimary() {
        if (has_error()) return nullptr;
        if (currentToken.type == TokenType::Integer || currentToken.type == TokenType::Float || 
            currentToken.type == TokenType::StringSingle || currentToken.type == TokenType::StringDouble || currentToken.type == TokenType::StringBacktick ||
            currentToken.type == TokenType::True || currentToken.type == TokenType::False || currentToken.type == TokenType::Undefined) {
            
            std::string type = "Integer";
            char quote = '\0';
            if (currentToken.type == TokenType::Float) type = "Float";
            else if (currentToken.type == TokenType::StringSingle) { type = "String"; quote = '\''; }
            else if (currentToken.type == TokenType::StringDouble) { type = "String"; quote = '"'; }
            else if (currentToken.type == TokenType::StringBacktick) { type = "String"; quote = '`'; }
            else if (currentToken.type == TokenType::True || currentToken.type == TokenType::False) type = "Boolean";
            else if (currentToken.type == TokenType::Undefined) type = "Undefined";
            
            auto node = std::make_shared<LiteralNode>(type, currentToken.value, quote);
            advance(); return node;
        }
        if (currentToken.type == TokenType::Identifier) { std::string name = currentToken.value; advance(); return std::make_shared<IdentifierNode>(name); }
        
        if (currentToken.type == TokenType::LParen) {
            lexer.mark(); Token savedCurrent = currentToken, savedNext = nextToken;
            advance(); std::vector<std::string> params; bool isParams = true;
            if (currentToken.type != TokenType::RParen) {
                if (currentToken.type == TokenType::Identifier) {
                    params.push_back(currentToken.value); advance();
                    while (currentToken.type == TokenType::Comma) {
                        advance();
                        if (currentToken.type == TokenType::Identifier) { params.push_back(currentToken.value); advance(); }
                        else { isParams = false; break; }
                    }
                } else isParams = false;
            }
            if (isParams && currentToken.type == TokenType::RParen) {
                advance();
                if (currentToken.type == TokenType::Arrow) {
                    advance(); 
                    auto body = parseStatement(); 
                    if (has_error()) { lexer.reset(); currentToken = savedCurrent; nextToken = savedNext; advance(); }
                    else return std::make_shared<FunctionDefNode>(params, body);
                }
            }
            lexer.reset(); currentToken = savedCurrent; nextToken = savedNext; advance();
            auto expr = parseExpression(); 
            if (has_error()) return nullptr;
            if (!expect(TokenType::RParen)) return nullptr; 
            return expr;
        }
        if (currentToken.type == TokenType::LBracket) {
            advance(); auto arr = std::make_shared<ArrayLiteralNode>();
            if (currentToken.type != TokenType::RBracket) {
                arr->elements.push_back(parseExpression()); if (has_error()) return nullptr;
                while (currentToken.type == TokenType::Comma) { 
                    advance(); 
                    if (currentToken.type == TokenType::RBracket) break; 
                    arr->elements.push_back(parseExpression()); if (has_error()) return nullptr; 
                }
            }
            if (!expect(TokenType::RBracket)) return nullptr; 
            return arr;
        }
        if (currentToken.type == TokenType::LBrace) {
            advance(); auto obj = std::make_shared<ObjectLiteralNode>();
            if (currentToken.type != TokenType::RBrace) {
                while (true) {
                    std::string key;
                    if (currentToken.type == TokenType::Identifier || currentToken.type == TokenType::StringSingle || currentToken.type == TokenType::StringDouble || currentToken.type == TokenType::StringBacktick) { 
                        key = currentToken.value; advance(); 
                    } else { 
                        error_msg = "Expected object key at line " + std::to_string(currentToken.line); return nullptr; 
                    }
                    if (!expect(TokenType::Colon)) return nullptr; 
                    obj->properties.push_back({key, parseExpression()}); if (has_error()) return nullptr;
                    if (currentToken.type == TokenType::Comma) { advance(); if (currentToken.type == TokenType::RBrace) break; }
                    else break;
                }
            }
            if (!expect(TokenType::RBrace)) return nullptr; 
            return obj;
        }
        error_msg = "Unexpected token in primary expression: " + currentToken.value + " at line " + std::to_string(currentToken.line);
        return nullptr;
    }
};

// ============================================================================
// 4. Value & Environment
// ============================================================================

struct Environment;

struct Value {
    enum Type { Undefined, Integer, Float, Boolean, String, Array, Object, Function };
    Type type;
    uint64_t intVal; double floatVal; bool boolVal; std::string strVal;
    std::vector<std::shared_ptr<Value>> arrVal;
    std::unordered_map<std::string, std::shared_ptr<Value>> objVal;
    std::shared_ptr<ASTNode> funcAst;
    std::shared_ptr<Environment> closureEnv;

    Value() : type(Undefined), intVal(0), floatVal(0.0), boolVal(false) {}
    static std::shared_ptr<Value> undefined() { auto v = std::make_shared<Value>(); v->type = Undefined; return v; }
    static std::shared_ptr<Value> makeInt(uint64_t v) { auto val = std::make_shared<Value>(); val->type = Integer; val->intVal = v; return val; }
    static std::shared_ptr<Value> makeFloat(double v) { auto val = std::make_shared<Value>(); val->type = Float; val->floatVal = v; return val; }
    static std::shared_ptr<Value> makeBool(bool v) { auto val = std::make_shared<Value>(); val->type = Boolean; val->boolVal = v; return val; }
    static std::shared_ptr<Value> makeString(const std::string& v) { auto val = std::make_shared<Value>(); val->type = String; val->strVal = v; return val; }
    static std::shared_ptr<Value> makeArray() { auto val = std::make_shared<Value>(); val->type = Array; return val; }
    static std::shared_ptr<Value> makeObject() { auto val = std::make_shared<Value>(); val->type = Object; return val; }
    static std::shared_ptr<Value> makeFunction(std::shared_ptr<ASTNode> ast, std::shared_ptr<Environment> env) {
        auto val = std::make_shared<Value>(); val->type = Function; val->funcAst = ast; val->closureEnv = env; return val;
    }

    std::string toString() const {
        if (type == Undefined) return "undefined";
        if (type == Integer) return std::to_string(intVal);
        if (type == Float) return std::to_string(floatVal);
        if (type == Boolean) return boolVal ? "true" : "false";
        if (type == String) return strVal;
        if (type == Array) {
            std::string res = "[";
            for (size_t i = 0; i < arrVal.size(); ++i) { res += arrVal[i]->toString(); if (i + 1 < arrVal.size()) res += ","; }
            return res + "]";
        }
        if (type == Object) return "[object Object]";
        if (type == Function) return "[function]";
        return "";
    }
    
    double toFloat() const { 
        if (type == Integer) return (double)intVal;
        if (type == Float) return floatVal;
        if (type == Boolean) return boolVal ? 1.0 : 0.0;
        if (type == String) return strVal.empty() ? 0.0 : std::strtod(strVal.c_str(), nullptr);
        return 0.0;
    }
    
    uint64_t toInt() const { 
        if (type == Integer) return intVal;
        if (type == Float) return (uint64_t)floatVal;
        if (type == Boolean) return boolVal ? 1 : 0;
        if (type == String) return strVal.empty() ? 0 : std::strtoull(strVal.c_str(), nullptr, 10);
        return 0;
    }
};

struct Environment {
    std::shared_ptr<Environment> parent;
    std::unordered_map<std::string, std::shared_ptr<Value>> values;
    Environment(std::shared_ptr<Environment> p = nullptr) : parent(p) {}
    void set(const std::string& name, std::shared_ptr<Value> val) { values[name] = val; }
    std::shared_ptr<Value> get(const std::string& name) {
        if (values.count(name)) return values[name];
        if (parent) return parent->get(name);
        return Value::undefined();
    }
};

// ============================================================================
// 5. SLP Interpreter & API
// ============================================================================

struct EvalResult {
    std::shared_ptr<Value> value;
    bool is_return;
    bool is_break;
    bool is_continue;
    bool is_error;
    std::string error_msg;
    
    static EvalResult make(std::shared_ptr<Value> v, bool ret = false, bool brk = false, bool cont = false) { 
        return {v, ret, brk, cont, false, ""}; 
    }
    static EvalResult error(const std::string& msg) { 
        return {nullptr, false, false, false, true, msg}; 
    }
};

class SLP {
    std::shared_ptr<Environment> globalEnv;
    std::unordered_set<std::string> tokens;
    std::vector<std::string>* current_new_tokens = nullptr;

    bool isTruthy(std::shared_ptr<Value> v) {
        if (v->type == Value::Undefined) return false;
        if (v->type == Value::Boolean) return v->boolVal;
        if (v->type == Value::Integer) return v->intVal != 0;
        if (v->type == Value::Float) return v->floatVal != 0.0;
        if (v->type == Value::String) return !v->strVal.empty();
        return true;
    }

    std::string evaluateTemplate(const std::string& tmpl, std::shared_ptr<Environment> env) {
        std::string result; size_t i = 0;
        while (i < tmpl.size()) {
            if (i + 1 < tmpl.size() && tmpl[i] == '$' && tmpl[i+1] == '{') {
                size_t start = i + 2;
                size_t end = start;
                int braceCount = 1;
                while (end < tmpl.size() && braceCount > 0) {
                    if (tmpl[end] == '{') braceCount++;
                    else if (tmpl[end] == '}') braceCount--;
                    if (braceCount > 0) end++;
                }
                if (braceCount == 0) {
                    std::string exprStr = tmpl.substr(start, end - start);
                    Parser exprParser(exprStr);
                    auto exprAst = exprParser.parseExpression();
                    if (exprAst) {
                        EvalResult res = evaluate(exprAst, env);
                        if (!res.is_error && res.value) result += res.value->toString();
                        else result += "undefined";
                    } else {
                        result += "undefined";
                    }
                    i = end + 1;
                } else {
                    result += tmpl[i++];
                }
            } else {
                result += tmpl[i++];
            }
        }
        return result;
    }

    EvalResult applyBinaryOp(std::shared_ptr<Value> left, const std::string& op, std::shared_ptr<Value> right) {
        if (op == "+") {
            if (left->type == Value::String || right->type == Value::String) return EvalResult::make(Value::makeString(left->toString() + right->toString()));
            if (left->type == Value::Integer && right->type == Value::Integer) return EvalResult::make(Value::makeInt(left->intVal + right->intVal));
            return EvalResult::make(Value::makeFloat(left->toFloat() + right->toFloat()));
        }
        if (op == "-") { 
            if (left->type == Value::Integer && right->type == Value::Integer) return EvalResult::make(Value::makeInt(left->intVal - right->intVal)); 
            return EvalResult::make(Value::makeFloat(left->toFloat() - right->toFloat())); 
        }
        if (op == "*") { 
            if (left->type == Value::Integer && right->type == Value::Integer) return EvalResult::make(Value::makeInt(left->intVal * right->intVal)); 
            return EvalResult::make(Value::makeFloat(left->toFloat() * right->toFloat())); 
        }
        if (op == "/") { 
            if (left->type == Value::Integer && right->type == Value::Integer) {
                if (right->intVal == 0) return EvalResult::error("Division by zero");
                if (left->intVal % right->intVal == 0) return EvalResult::make(Value::makeInt(left->intVal / right->intVal));
            }
            if (right->type == Value::Float && right->floatVal == 0.0) return EvalResult::error("Division by zero");
            return EvalResult::make(Value::makeFloat(left->toFloat() / right->toFloat())); 
        }
        if (op == "%") { 
            if (left->type == Value::Integer && right->type == Value::Integer) {
                if (right->intVal == 0) return EvalResult::error("Modulo by zero");
                return EvalResult::make(Value::makeInt(left->intVal % right->intVal));
            }
            if (right->type == Value::Float && right->floatVal == 0.0) return EvalResult::error("Modulo by zero");
            return EvalResult::make(Value::makeFloat(std::fmod(left->toFloat(), right->toFloat()))); 
        }
        if (op == "**") {
            if (left->type == Value::Integer && right->type == Value::Integer) {
                uint64_t base = left->intVal;
                uint64_t exp = right->intVal;
                uint64_t result = 1;
                while (exp > 0) {
                    if (exp % 2 == 1) result *= base;
                    base *= base;
                    exp /= 2;
                }
                return EvalResult::make(Value::makeInt(result));
            }
            return EvalResult::make(Value::makeFloat(std::pow(left->toFloat(), right->toFloat())));
        }
        
        if (op == "==" || op == "!=") {
            bool eq = false;
            if (left->type == right->type) {
                if (left->type == Value::Integer) eq = (left->intVal == right->intVal);
                else if (left->type == Value::Float) eq = (left->floatVal == right->floatVal);
                else if (left->type == Value::Boolean) eq = (left->boolVal == right->boolVal);
                else if (left->type == Value::String) eq = (left->strVal == right->strVal);
                else if (left->type == Value::Undefined) eq = true;
                else eq = (left.get() == right.get());
            } else {
                if (left->type == Value::Undefined || right->type == Value::Undefined) eq = false;
                else if (left->type == Value::Integer && right->type == Value::Float) eq = ((double)left->intVal == right->floatVal);
                else if (left->type == Value::Float && right->type == Value::Integer) eq = (left->floatVal == (double)right->intVal);
                else if (left->type == Value::Boolean) {
                    uint64_t leftInt = left->boolVal ? 1 : 0;
                    if (right->type == Value::Integer) eq = (leftInt == right->intVal);
                    else if (right->type == Value::Float) eq = ((double)leftInt == right->floatVal);
                    else eq = (std::to_string(leftInt) == right->toString());
                } else if (right->type == Value::Boolean) {
                    uint64_t rightInt = right->boolVal ? 1 : 0;
                    if (left->type == Value::Integer) eq = (left->intVal == rightInt);
                    else if (left->type == Value::Float) eq = (left->floatVal == (double)rightInt);
                    else eq = (left->toString() == std::to_string(rightInt));
                } else if ((left->type == Value::Integer || left->type == Value::Float) && right->type == Value::String) {
                    eq = (left->toString() == right->strVal);
                } else if (left->type == Value::String && (right->type == Value::Integer || right->type == Value::Float)) {
                    eq = (left->strVal == right->toString());
                } else {
                    eq = (left->toString() == right->toString());
                }
            }
            return EvalResult::make(Value::makeBool(op == "==" ? eq : !eq));
        }

        if (op == "<") return EvalResult::make(Value::makeBool(left->toFloat() < right->toFloat()));
        if (op == "<=") return EvalResult::make(Value::makeBool(left->toFloat() <= right->toFloat()));
        if (op == ">") return EvalResult::make(Value::makeBool(left->toFloat() > right->toFloat()));
        if (op == ">=") return EvalResult::make(Value::makeBool(left->toFloat() >= right->toFloat()));
        if (op == "&&") return EvalResult::make(Value::makeBool(isTruthy(left) && isTruthy(right)));
        if (op == "||") return EvalResult::make(Value::makeBool(isTruthy(left) || isTruthy(right)));
        if (op == "&") return EvalResult::make(Value::makeInt(left->toInt() & right->toInt()));
        if (op == "|") return EvalResult::make(Value::makeInt(left->toInt() | right->toInt()));
        if (op == "^") return EvalResult::make(Value::makeInt(left->toInt() ^ right->toInt()));
        if (op == "<<") return EvalResult::make(Value::makeInt(left->toInt() << right->toInt()));
        if (op == ">>") return EvalResult::make(Value::makeInt(left->toInt() >> right->toInt()));
        return EvalResult::error("Unknown binary operator: " + op);
    }

    EvalResult evaluate(ASTPtr node, std::shared_ptr<Environment> env) {
        if (!node) return EvalResult::make(Value::undefined());

        if (auto lit = ast_cast<LiteralNode>(node, NodeType::Literal)) {
            if (lit->type == "Integer") {
                uint64_t val = 0;
                if (lit->value.length() > 2 && lit->value[1] == 'x') {
                    val = std::strtoull(lit->value.c_str(), nullptr, 16);
                } else if (lit->value.length() > 2 && lit->value[1] == 'b') {
                    val = std::strtoull(lit->value.c_str() + 2, nullptr, 2);
                } else if (lit->value.length() > 2 && lit->value[1] == 'o') {
                    val = std::strtoull(lit->value.c_str() + 2, nullptr, 8);
                } else {
                    val = std::strtoull(lit->value.c_str(), nullptr, 10);
                }
                return EvalResult::make(Value::makeInt(val));
            }
            if (lit->type == "Float") return EvalResult::make(Value::makeFloat(std::strtod(lit->value.c_str(), nullptr)));
            if (lit->type == "String") {
                if (lit->quoteType != '\'' && lit->value.find("${") != std::string::npos) {
                    return EvalResult::make(Value::makeString(evaluateTemplate(lit->value, env)));
                }
                return EvalResult::make(Value::makeString(lit->value));
            }
            if (lit->type == "Boolean") return EvalResult::make(Value::makeBool(lit->value == "true"));
            return EvalResult::make(Value::undefined());
        }
        if (auto id = ast_cast<IdentifierNode>(node, NodeType::Identifier)) return EvalResult::make(env->get(id->name));
        
        if (auto varDecl = ast_cast<VarDeclNode>(node, NodeType::VarDecl)) {
            std::shared_ptr<Value> initVal = Value::undefined();
            if (varDecl->initializer) {
                EvalResult res = evaluate(varDecl->initializer, env);
                if (res.is_error) return res;
                initVal = res.value;
            }
            env->set(varDecl->name, initVal);
            if (varDecl->isToken) {
                if (tokens.find(varDecl->name) == tokens.end()) {
                    tokens.insert(varDecl->name);
                    if (current_new_tokens) current_new_tokens->push_back(varDecl->name);
                }
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto assign = ast_cast<AssignmentNode>(node, NodeType::Assignment)) {
            EvalResult rightRes = evaluate(assign->right, env);
            if (rightRes.is_error) return rightRes;
            std::shared_ptr<Value> rightVal = rightRes.value;
            std::string baseOp = assign->op;
            if (baseOp == "+=") baseOp = "+"; else if (baseOp == "-=") baseOp = "-"; else if (baseOp == "*=") baseOp = "*";
            else if (baseOp == "/=") baseOp = "/"; else if (baseOp == "%=") baseOp = "%"; else if (baseOp == "<<=") baseOp = "<<";
            else if (baseOp == ">>=") baseOp = ">>"; else if (baseOp == "&=") baseOp = "&"; else if (baseOp == "^=") baseOp = "^"; else if (baseOp == "|=") baseOp = "|";

            if (auto id = ast_cast<IdentifierNode>(assign->left, NodeType::Identifier)) {
                std::shared_ptr<Environment> targetEnv = env;
                std::shared_ptr<Environment> curr = env;
                while (curr) {
                    if (curr->values.count(id->name)) { targetEnv = curr; break; }
                    curr = curr->parent;
                }
                std::shared_ptr<Value> leftVal = targetEnv->get(id->name);
                EvalResult binRes = (assign->op == "=") ? EvalResult::make(rightVal) : applyBinaryOp(leftVal, baseOp, rightVal);
                if (binRes.is_error) return binRes;
                targetEnv->set(id->name, binRes.value);
                return EvalResult::make(rightVal);
            }
            if (auto member = ast_cast<MemberAccessNode>(assign->left, NodeType::MemberAccess)) {
                EvalResult objRes = evaluate(member->object, env);
                if (objRes.is_error) return objRes;
                std::shared_ptr<Value> obj = objRes.value;
                if (obj->type == Value::Object) {
                    std::shared_ptr<Value> currentVal = obj->objVal.count(member->property) ? obj->objVal[member->property] : Value::undefined();
                    EvalResult binRes = (assign->op == "=") ? EvalResult::make(rightVal) : applyBinaryOp(currentVal, baseOp, rightVal);
                    if (binRes.is_error) return binRes;
                    obj->objVal[member->property] = binRes.value;
                } else {
                    return EvalResult::error("Cannot assign to property of non-object");
                }
                return EvalResult::make(rightVal);
            }
            if (auto idx = ast_cast<ArrayIndexNode>(assign->left, NodeType::ArrayIndex)) {
                EvalResult targetRes = evaluate(idx->array, env);
                if (targetRes.is_error) return targetRes;
                std::shared_ptr<Value> target = targetRes.value;
                EvalResult idxRes = evaluate(idx->index, env);
                if (idxRes.is_error) return idxRes;
                size_t i = idxRes.value->toInt();
                
                if (target->type == Value::Array) {
                    if (i >= target->arrVal.size()) target->arrVal.resize(i + 1, Value::undefined());
                    std::shared_ptr<Value> currentVal = target->arrVal[i];
                    EvalResult binRes = (assign->op == "=") ? EvalResult::make(rightVal) : applyBinaryOp(currentVal, baseOp, rightVal);
                    if (binRes.is_error) return binRes;
                    target->arrVal[i] = binRes.value;
                } else if (target->type == Value::Object) {
                    std::string key = idxRes.value->toString();
                    std::shared_ptr<Value> currentVal = target->objVal.count(key) ? target->objVal[key] : Value::undefined();
                    EvalResult binRes = (assign->op == "=") ? EvalResult::make(rightVal) : applyBinaryOp(currentVal, baseOp, rightVal);
                    if (binRes.is_error) return binRes;
                    target->objVal[key] = binRes.value;
                } else {
                    return EvalResult::error("Cannot assign to index of non-array/object");
                }
                return EvalResult::make(rightVal);
            }
            return EvalResult::error("Invalid assignment target");
        }
        if (auto binOp = ast_cast<BinaryOpNode>(node, NodeType::BinaryOp)) {
            EvalResult leftRes = evaluate(binOp->left, env);
            if (leftRes.is_error) return leftRes;
            EvalResult rightRes = evaluate(binOp->right, env);
            if (rightRes.is_error) return rightRes;
            return applyBinaryOp(leftRes.value, binOp->op, rightRes.value);
        }
        if (auto unOp = ast_cast<UnaryOpNode>(node, NodeType::UnaryOp)) {
            EvalResult opRes = evaluate(unOp->operand, env);
            if (opRes.is_error) return opRes;
            std::shared_ptr<Value> op = opRes.value;
            if (unOp->op == "!") return EvalResult::make(Value::makeBool(!isTruthy(op)));
            if (unOp->op == "-") return EvalResult::make(op->type == Value::Integer ? Value::makeInt(-(int64_t)op->intVal) : Value::makeFloat(-op->toFloat()));
            if (unOp->op == "~") return EvalResult::make(Value::makeInt(~op->toInt()));
        }
        if (auto update = ast_cast<UpdateNode>(node, NodeType::Update)) {
            if (auto id = ast_cast<IdentifierNode>(update->target, NodeType::Identifier)) {
                std::shared_ptr<Environment> targetEnv = env;
                std::shared_ptr<Environment> curr = env;
                while (curr) {
                    if (curr->values.count(id->name)) { targetEnv = curr; break; }
                    curr = curr->parent;
                }
                uint64_t newVal = targetEnv->get(id->name)->toInt();
                if (update->op == "++") newVal++; else newVal--;
                targetEnv->set(id->name, Value::makeInt(newVal));
                return EvalResult::make(Value::makeInt(update->isPrefix ? newVal : (update->op == "++" ? newVal - 1 : newVal + 1)));
            }
            return EvalResult::error("Invalid update target");
        }
        if (auto cond = ast_cast<ConditionalNode>(node, NodeType::Conditional)) {
            EvalResult condRes = evaluate(cond->condition, env);
            if (condRes.is_error) return condRes;
            return evaluate(isTruthy(condRes.value) ? cond->trueExpr : cond->falseExpr, env);
        }
        
        if (auto block = ast_cast<BlockNode>(node, NodeType::Block)) {
            for (auto stmt : block->statements) {
                EvalResult res = evaluate(stmt, env);
                if (res.is_error || res.is_return || res.is_break || res.is_continue) return res;
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto ifNode = ast_cast<IfNode>(node, NodeType::If)) {
            EvalResult condRes = evaluate(ifNode->condition, env);
            if (condRes.is_error) return condRes;
            if (isTruthy(condRes.value)) {
                EvalResult res = evaluate(ifNode->thenBranch, env);
                if (res.is_error || res.is_return || res.is_break || res.is_continue) return res;
            } else if (ifNode->elseBranch) {
                EvalResult res = evaluate(ifNode->elseBranch, env);
                if (res.is_error || res.is_return || res.is_break || res.is_continue) return res;
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto forNode = ast_cast<ForNode>(node, NodeType::For)) {
            if (forNode->init) {
                EvalResult res = evaluate(forNode->init, env);
                if (res.is_error || res.is_return) return res;
            }
            while (!forNode->condition || isTruthy(evaluate(forNode->condition, env).value)) {
                EvalResult res = evaluate(forNode->body, env);
                if (res.is_error || res.is_return) return res;
                if (res.is_break) return EvalResult::make(Value::undefined());
                if (res.is_continue) {
                    if (forNode->increment) {
                        EvalResult incRes = evaluate(forNode->increment, env);
                        if (incRes.is_error) return incRes;
                    }
                    continue;
                }
                if (forNode->increment) {
                    EvalResult incRes = evaluate(forNode->increment, env);
                    if (incRes.is_error) return incRes;
                }
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto forIn = ast_cast<ForInNode>(node, NodeType::ForIn)) {
            EvalResult iterRes = evaluate(forIn->iterable, env);
            if (iterRes.is_error) return iterRes;
            std::shared_ptr<Value> iterable = iterRes.value;
            if (iterable->type == Value::Object) {
                for (auto const& [key, val] : iterable->objVal) {
                    env->set(forIn->varName, Value::makeString(key));
                    EvalResult res = evaluate(forIn->body, env);
                    if (res.is_error || res.is_return) return res;
                    if (res.is_break) return EvalResult::make(Value::undefined());
                    if (res.is_continue) continue;
                }
            } else if (iterable->type == Value::Array) {
                for (size_t i = 0; i < iterable->arrVal.size(); ++i) {
                    env->set(forIn->varName, Value::makeInt(i));
                    EvalResult res = evaluate(forIn->body, env);
                    if (res.is_error || res.is_return) return res;
                    if (res.is_break) return EvalResult::make(Value::undefined());
                    if (res.is_continue) continue;
                }
            } else {
                return EvalResult::error("Cannot iterate over non-object/array");
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto whileNode = ast_cast<WhileNode>(node, NodeType::While)) {
            while (true) {
                EvalResult condRes = evaluate(whileNode->condition, env);
                if (condRes.is_error) return condRes;
                if (!isTruthy(condRes.value)) break;
                EvalResult res = evaluate(whileNode->body, env); 
                if (res.is_error || res.is_return) return res; 
                if (res.is_break) return EvalResult::make(Value::undefined());
                if (res.is_continue) continue;
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto doWhile = ast_cast<DoWhileNode>(node, NodeType::DoWhile)) {
            EvalResult condRes;
            do { 
                EvalResult res = evaluate(doWhile->body, env); 
                if (res.is_error || res.is_return) return res; 
                if (res.is_break) return EvalResult::make(Value::undefined());
                if (res.is_continue) {
                    condRes = evaluate(doWhile->condition, env);
                    if (condRes.is_error) return condRes;
                    continue;
                }
                condRes = evaluate(doWhile->condition, env);
                if (condRes.is_error) return condRes;
            } while (isTruthy(condRes.value));
            return EvalResult::make(Value::undefined());
        }
        if (auto switchNode = ast_cast<SwitchNode>(node, NodeType::Switch)) {
            EvalResult exprRes = evaluate(switchNode->expression, env);
            if (exprRes.is_error) return exprRes;
            std::shared_ptr<Value> exprVal = exprRes.value; 
            bool matched = false;
            for (auto& c : switchNode->cases) {
                EvalResult caseRes = evaluate(c.first, env);
                if (caseRes.is_error) return caseRes;
                if (!matched && caseRes.value->toString() == exprVal->toString()) matched = true;
                if (matched) { 
                    EvalResult res = evaluate(c.second, env); 
                    if (res.is_error || res.is_return) return res; 
                    if (res.is_break) return EvalResult::make(Value::undefined());
                }
            }
            if (!matched && switchNode->defaultCase) { 
                EvalResult res = evaluate(switchNode->defaultCase, env); 
                if (res.is_error || res.is_return) return res; 
                if (res.is_break) return EvalResult::make(Value::undefined());
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto ret = ast_cast<ReturnNode>(node, NodeType::Return)) {
            std::shared_ptr<Value> val = Value::undefined();
            if (ret->value) {
                EvalResult res = evaluate(ret->value, env);
                if (res.is_error) return res;
                val = res.value;
            }
            return EvalResult::make(val, true);
        }
        if (auto brk = ast_cast<BreakNode>(node, NodeType::Break)) {
            return EvalResult::make(Value::undefined(), false, true, false);
        }
        if (auto cont = ast_cast<ContinueNode>(node, NodeType::Continue)) {
            return EvalResult::make(Value::undefined(), false, false, true);
        }
        
        if (auto funcDef = ast_cast<FunctionDefNode>(node, NodeType::FunctionDef)) return EvalResult::make(Value::makeFunction(funcDef, env));
        
        if (auto call = ast_cast<CallNode>(node, NodeType::Call)) {
            if (auto member = ast_cast<MemberAccessNode>(call->callee, NodeType::MemberAccess)) {
                EvalResult objRes = evaluate(member->object, env);
                if (objRes.is_error) return objRes;
                std::shared_ptr<Value> obj = objRes.value;
                if (obj->type == Value::Array) {
                    if (member->property == "push") { 
                        for (auto arg : call->args) { 
                            EvalResult argRes = evaluate(arg, env); 
                            if (argRes.is_error) return argRes;
                            obj->arrVal.push_back(argRes.value); 
                        } 
                        return EvalResult::make(Value::makeInt(obj->arrVal.size())); 
                    }
                    if (member->property == "unshift") { 
                        for (auto it = call->args.rbegin(); it != call->args.rend(); ++it) { 
                            EvalResult argRes = evaluate(*it, env); 
                            if (argRes.is_error) return argRes;
                            obj->arrVal.insert(obj->arrVal.begin(), argRes.value); 
                        } 
                        return EvalResult::make(Value::makeInt(obj->arrVal.size())); 
                    }
                    if (member->property == "pop") { 
                        if (obj->arrVal.empty()) return EvalResult::make(Value::undefined()); 
                        auto val = obj->arrVal.back(); obj->arrVal.pop_back(); 
                        return EvalResult::make(val); 
                    }
                    if (member->property == "shift") { 
                        if (obj->arrVal.empty()) return EvalResult::make(Value::undefined()); 
                        auto val = obj->arrVal.front(); obj->arrVal.erase(obj->arrVal.begin()); 
                        return EvalResult::make(val); 
                    }
                }
                return EvalResult::error("Unsupported array method: " + member->property);
            }
            EvalResult calleeRes = evaluate(call->callee, env);
            if (calleeRes.is_error) return calleeRes;
            std::shared_ptr<Value> callee = calleeRes.value;
            if (callee->type == Value::Function) {
                auto funcEnv = std::make_shared<Environment>(callee->closureEnv);
                auto funcDef = ast_cast<FunctionDefNode>(callee->funcAst, NodeType::FunctionDef);
                auto argsArray = Value::makeArray();
                for (size_t i = 0; i < call->args.size(); ++i) {
                    EvalResult argRes = evaluate(call->args[i], env);
                    if (argRes.is_error) return argRes;
                    std::shared_ptr<Value> argVal = argRes.value;
                    if (i < funcDef->params.size()) funcEnv->set(funcDef->params[i], argVal);
                    argsArray->arrVal.push_back(argVal);
                }
                funcEnv->set("args", argsArray);
                EvalResult res = evaluate(funcDef->body, funcEnv);
                return EvalResult::make(res.value, false);
            }
            return EvalResult::error("Callee is not a function");
        }
        if (auto member = ast_cast<MemberAccessNode>(node, NodeType::MemberAccess)) {
            EvalResult objRes = evaluate(member->object, env);
            if (objRes.is_error) return objRes;
            std::shared_ptr<Value> obj = objRes.value;
            if (member->property == "length" && obj->type == Value::Array) return EvalResult::make(Value::makeInt(obj->arrVal.size()));
            if (obj->type == Value::Object) return EvalResult::make(obj->objVal.count(member->property) ? obj->objVal[member->property] : Value::undefined());
            return EvalResult::error("Cannot access property " + member->property + " on non-object");
        }
        
        if (auto idx = ast_cast<ArrayIndexNode>(node, NodeType::ArrayIndex)) {
            EvalResult arrRes = evaluate(idx->array, env);
            if (arrRes.is_error) return arrRes;
            std::shared_ptr<Value> arr = arrRes.value;
            EvalResult idxRes = evaluate(idx->index, env);
            if (idxRes.is_error) return idxRes;
            std::shared_ptr<Value> indexVal = idxRes.value;
            
            if (arr->type == Value::Array) {
                size_t i = indexVal->toInt();
                if (i >= arr->arrVal.size()) {
                    return EvalResult::error("Out-of-bounds array access at index " + std::to_string(i));
                }
                return EvalResult::make(arr->arrVal[i]);
            }
            if (arr->type == Value::Object) {
                std::string key = indexVal->toString();
                return EvalResult::make(arr->objVal.count(key) ? arr->objVal[key] : Value::undefined());
            }
            return EvalResult::error("Cannot index into non-array/object");
        }

        if (auto tokenDir = ast_cast<TokenDirectiveNode>(node, NodeType::TokenDirective)) {
            if (tokens.find(tokenDir->functionName) == tokens.end()) {
                tokens.insert(tokenDir->functionName);
                if (current_new_tokens) current_new_tokens->push_back(tokenDir->functionName);
            }
            return EvalResult::make(Value::undefined());
        }
        if (auto arrLit = ast_cast<ArrayLiteralNode>(node, NodeType::ArrayLiteral)) {
            auto arr = Value::makeArray(); 
            for (auto el : arrLit->elements) {
                EvalResult elRes = evaluate(el, env);
                if (elRes.is_error) return elRes;
                arr->arrVal.push_back(elRes.value); 
            }
            return EvalResult::make(arr);
        }
        if (auto objLit = ast_cast<ObjectLiteralNode>(node, NodeType::ObjectLiteral)) {
            auto obj = Value::makeObject(); 
            for (auto& prop : objLit->properties) {
                EvalResult propRes = evaluate(prop.second, env);
                if (propRes.is_error) return propRes;
                obj->objVal[prop.first] = propRes.value; 
            }
            return EvalResult::make(obj);
        }
        if (auto typeOf = ast_cast<TypeOfNode>(node, NodeType::TypeOf)) {
            EvalResult valRes = evaluate(typeOf->operand, env);
            if (valRes.is_error || !valRes.value) {
                return EvalResult::make(Value::makeString("undefined"));
            }
            std::shared_ptr<Value> val = valRes.value;
            std::string typeName = "undefined";
            if (val->type == Value::Integer) typeName = "integer";
            else if (val->type == Value::Float) typeName = "float";
            else if (val->type == Value::Boolean) typeName = "boolean";
            else if (val->type == Value::String) typeName = "string";
            else if (val->type == Value::Array) typeName = "array";
            else if (val->type == Value::Object) typeName = "object";
            else if (val->type == Value::Function) typeName = "function";
            return EvalResult::make(Value::makeString(typeName));
        }
        return EvalResult::make(Value::undefined());
    }

    std::shared_ptr<Value> stringToValue(const std::string& str) {
        if (str == "true") return Value::makeBool(true);
        if (str == "false") return Value::makeBool(false);
        if (str == "undefined") return Value::undefined();
        if (str.empty()) return Value::makeString(str);

        bool isInt = true;
        bool isFloat = false;
        int dotCount = 0;
        size_t start = 0;
        bool negative = false;
        if (str[0] == '-') { negative = true; start = 1; }
        else if (str[0] == '+') { start = 1; }
        
        if (start == str.size()) return Value::makeString(str);

        for (size_t i = start; i < str.size(); ++i) {
            if (str[i] == '.') { dotCount++; isInt = false; } 
            else if (!std::isdigit(static_cast<unsigned char>(str[i]))) { isInt = false; isFloat = false; break; }
        }
        if (dotCount == 1) isFloat = true;

        if (isInt) {
            uint64_t val = 0;
            for (size_t i = start; i < str.size(); ++i) val = val * 10 + static_cast<uint64_t>(str[i] - '0');
            return negative ? Value::makeInt(static_cast<uint64_t>(-(int64_t)val)) : Value::makeInt(val);
        }
        if (isFloat) {
            double val = 0.0, fraction = 0.0, divisor = 1.0;
            bool afterDot = false;
            for (size_t i = start; i < str.size(); ++i) {
                if (str[i] == '.') afterDot = true;
                else {
                    int digit = str[i] - '0';
                    if (!afterDot) val = val * 10.0 + static_cast<double>(digit);
                    else { divisor *= 10.0; fraction += static_cast<double>(digit) / divisor; }
                }
            }
            return Value::makeFloat(negative ? -(val + fraction) : (val + fraction));
        }
        return Value::makeString(str);
    }

    std::string executeToken(const std::string& token_name, const std::vector<std::shared_ptr<Value>>& argVals) {
        if (tokens.find(token_name) == tokens.end()) return "Error: Token not found: " + token_name;
        
        std::shared_ptr<Value> tokenVal = globalEnv->get(token_name);
        if (tokenVal->type == Value::Function) {
            auto funcEnv = std::make_shared<Environment>(tokenVal->closureEnv);
            auto funcDef = ast_cast<FunctionDefNode>(tokenVal->funcAst, NodeType::FunctionDef);
            if (!funcDef) return "Error: Invalid function AST";
            
            auto argsArray = Value::makeArray();
            for (size_t i = 0; i < argVals.size(); ++i) {
                if (i < funcDef->params.size()) funcEnv->set(funcDef->params[i], argVals[i]);
                argsArray->arrVal.push_back(argVals[i]);
            }
            funcEnv->set("args", argsArray);

            EvalResult res = evaluate(funcDef->body, funcEnv);
            if (res.is_error) return "Error: " + res.error_msg;
            return res.value->toString();
        } else {
            return tokenVal->toString();
        }
    }

public:
    SLP() { globalEnv = std::make_shared<Environment>(); }

    std::vector<std::string> define(const std::string& script) {
        Parser parser(script);
        ParseResult res = parser.parseProgram();
        if (res.is_error) return {"Parse Error: " + res.error_msg};
        
        auto prog = ast_cast<ProgramNode>(res.ast, NodeType::Program);
        std::vector<std::string> new_tokens;
        current_new_tokens = &new_tokens;
        
        for (auto stmt : prog->statements) {
            EvalResult evalRes = evaluate(stmt, globalEnv);
            if (evalRes.is_error) {
                current_new_tokens = nullptr;
                return {"Runtime Error: " + evalRes.error_msg};
            }
            if (evalRes.is_return) {
                current_new_tokens = nullptr;
                return {"Runtime Error: Unexpected return outside of function"};
            }
        }
        current_new_tokens = nullptr;
        return new_tokens;
    }

    std::string get(const std::string& token_name, const std::vector<std::string>& args) {
        std::vector<std::shared_ptr<Value>> argVals;
        argVals.reserve(args.size());
        for (const auto& argStr : args) argVals.push_back(stringToValue(argStr));
        return executeToken(token_name, argVals);
    }

    std::string get(const std::string& token_name, const std::vector<std::shared_ptr<Value>>& args) {
        return executeToken(token_name, args);
    }

    template <typename... Args>
    std::string get(const std::string& token_name, Args&&... args) {
        std::vector<std::shared_ptr<Value>> argVals = { convertToValue(std::forward<Args>(args))... };
        return executeToken(token_name, argVals);
    }

private:
    template <typename T>
    std::shared_ptr<Value> convertToValue(T arg) {
        if constexpr (std::is_same_v<std::decay_t<T>, bool>) {
            return Value::makeBool(arg);
        } else if constexpr (std::is_integral_v<T>) {
            return Value::makeInt(static_cast<uint64_t>(arg));
        } else if constexpr (std::is_floating_point_v<T>) {
            return Value::makeFloat(static_cast<double>(arg));
        } else if constexpr (std::is_same_v<std::decay_t<T>, const char*> || std::is_same_v<std::decay_t<T>, std::string>) {
            return Value::makeString(std::string(arg));
        } else {
            return Value::makeString("unsupported");
        }
    }
};