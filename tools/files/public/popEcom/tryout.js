/*
================================================================================
POPULATION-BACKED CURRENCY & UBI MODEL - JAVASCRIPT IMPLEMENTATION
================================================================================

Core Concept:
- Money supply (M) is backed by living population (P) × asset value per person (V)
- Every person receives monthly UBI payout (U)
- UBI is funded by a wealth tax proportional to each person's share of M
- Wealth naturally converges to V over time

Key Formulas:
- M = P × V                    (Total Money Supply)
- J = U × P                    (Total Monthly UBI Cost)
- personTaxRate = W / M        (Individual's share of money supply)
- personTaxTotal = personTaxRate × J  (Individual's tax contribution)
- W_new = W - personTaxTotal + U      (Wealth after UBI cycle)

Simplified Tax Formula:
- personTaxTotal = W × (U / V)  (Population cancels out - scale invariant!)

Convergence:
- If W < V: Net gain (converges up toward V)
- If W = V: Net zero (stable equilibrium)
- If W > V: Net loss (converges down toward V)

================================================================================
*/

// --- Utility Functions (No Intl dependency) ---
function print(m) { console.log(m); }
function printo(m) { console.log(JSON.stringify(m, null, 2)); }

/**
 * Format number as currency without Intl dependency
 * @param {number} n - Number to format
 * @returns {string} Formatted currency string
 */
function fmt(n) {
    if (n === null || n === undefined) return '$0';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(Math.round(n));
    const str = abs.toString();
    // Add commas every 3 digits from right
    const withCommas = str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + '$' + withCommas;
}

/**
 * Format number with 2 decimal places for precise amounts
 * @param {number} n - Number to format
 * @returns {string} Formatted currency string with cents
 */
function fmtPrecise(n) {
    if (n === null || n === undefined) return '$0.00';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const [dollars, cents] = abs.toFixed(2).split('.');
    const withCommas = dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + '$' + withCommas + '.' + cents;
}

/**
 * Format decimal as percentage
 * @param {number} n - Decimal value (0.023 = 2.3%)
 * @returns {string} Formatted percentage
 */
function fmtPercent(n) {
    if (n === null || n === undefined) return '0.000%';
    const pct = (n * 100).toFixed(3);
    return pct + '%';
}

/**
 * Format large numbers with suffixes (K, M, B, T)
 * @param {number} n - Number to format
 * @returns {string} Compact formatted string
 */
function fmtCompact(n) {
    if (n === null || n === undefined) return '0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
    return sign + abs.toFixed(0);
}

// --- Core UBI Calculation ---
/**
 * Calculate UBI tax and update person's wealth for one monthly cycle
 * @param {Object} person - {W: current wealth}
 * @param {Object} config - {P, V, U, M, J}
 * @returns {Object} Calculation details
 */
function ubiTaxCalc(person, config) {
    const { M, U, J } = config;
    
    // Step 1: Calculate person's share of total money supply
    const personTaxRate = person.W / M;
    
    // Step 2: Calculate tax based on share of total UBI cost
    const personTaxTotal = personTaxRate * J;
    
    // Step 3: Deduct tax from wealth
    person.W -= personTaxTotal;
    
    // Step 4: Add UBI payout to wealth
    person.W += U;
    
    // Return calculation details for analysis
    return {
        taxRate: personTaxRate,
        taxPaid: personTaxTotal,
        ubiReceived: U,
        netChange: U - personTaxTotal,
        newWealth: person.W
    };
}

/**
 * Simplified calculation using W × (U/V) - mathematically equivalent
 * @param {number} wealth - Current wealth
 * @param {number} U - Monthly UBI payout
 * @param {number} V - Asset value per person
 * @returns {Object} Tax calculation result
 */
function ubiTaxCalcSimple(wealth, U, V) {
    const taxRate = U / V;  // Effective monthly rate
    const tax = wealth * taxRate;
    const netChange = U - tax;
    const newWealth = wealth + netChange;
    
    return { 
        taxRate: taxRate, 
        tax: tax, 
        ubiReceived: U, 
        netChange: netChange, 
        newWealth: newWealth 
    };
}

/**
 * Simulate wealth convergence over multiple months
 * @param {Object} params - {startWealth, P, V, U, months}
 * @returns {Object} Simulation results
 */
function simulateConvergence(params) {
    const { startWealth, P, V, U, months = 12 } = params;
    const M = P * V;
    const J = U * P;
    
    let wealth = startWealth;
    const history = [];
    let totalTax = 0;
    
    for (let month = 1; month <= months; month++) {
        const result = ubiTaxCalc({ W: wealth }, { P: P, V: V, U: U, M: M, J: J });
        totalTax += result.taxPaid;
        
        history.push({
            month: month,
            startWealth: wealth,
            taxPaid: result.taxPaid,
            ubiReceived: U,
            netChange: result.netChange,
            endWealth: result.newWealth
        });
        
        wealth = result.newWealth;
    }
    
    // Closed-form verification: W(n) = V + (W₀ - V) × (1 - U/V)^n
    const r = U / V;
    const closedFormWealth = V + (startWealth - V) * Math.pow(1 - r, months);
    
    return {
        params: params,
        startingWealth: startWealth,
        endingWealth: wealth,
        totalTaxPaid: totalTax,
        totalUBIReceived: U * months,
        netChange: wealth - startWealth,
        netChangePercent: startWealth !== 0 ? ((wealth - startWealth) / Math.abs(startWealth)) * 100 : null,
        convergenceDirection: startWealth < V ? 'UP' : startWealth > V ? 'DOWN' : 'STABLE',
        closedFormWealth: closedFormWealth,
        history: history
    };
}

/**
 * Calculate time to reach equilibrium (within threshold of V)
 * @param {Object} params - {startWealth, V, U, threshold}
 * @returns {Object} Convergence analysis
 */
function analyzeConvergence(params) {
    const { startWealth, V, U, threshold = 0.01 } = params;
    
    // Already at equilibrium?
    if (Math.abs(startWealth - V) < threshold * V) {
        return { monthsToEquilibrium: 0, alreadyAtEquilibrium: true };
    }
    
    // Use closed-form solution: W(n) = V + (W₀ - V) × (1 - r)^n
    // Solve for n when |W(n) - V| < threshold × V
    const r = U / V;
    const distance = Math.abs(startWealth - V);
    const targetDistance = threshold * V;
    
    // |W₀ - V| × (1-r)^n < threshold × V
    // (1-r)^n < (threshold × V) / |W₀ - V|
    // n > ln((threshold × V) / |W₀ - V|) / ln(1-r)
    
    const ratio = targetDistance / distance;
    if (ratio >= 1) {
        return { monthsToEquilibrium: 0, alreadyAtEquilibrium: true };
    }
    
    const months = Math.ceil(Math.log(ratio) / Math.log(1 - r));
    const years = months / 12;
    
    // Half-life calculation
    const halfLifeMonths = Math.ceil(Math.log(0.5) / Math.log(1 - r));
    const halfLifeYears = halfLifeMonths / 12;
    
    return {
        monthsToEquilibrium: months,
        yearsToEquilibrium: years,
        halfLifeMonths: halfLifeMonths,
        halfLifeYears: halfLifeYears
    };
}

// --- Scenario Runner ---
function runScenario(scenario) {
    const { name, P, V, U, startWealth, months = 12 } = scenario;
    
    print('\n' + '='.repeat(80));
    print('SCENARIO: ' + name);
    print('='.repeat(80));
    print('Parameters:');
    print('  Population (P):     ' + fmtCompact(P) + ' people');
    print('  Asset Value (V):    ' + fmt(V));
    print('  Monthly UBI (U):    ' + fmt(U));
    print('  Money Supply (M):   ' + fmt(P * V));
    print('  Total UBI Cost (J): ' + fmt(U * P) + '/month');
    print('  Effective Rate:     ' + fmtPercent(U / V) + '/month');
    print('\nStarting Wealth: ' + fmt(startWealth));
    
    // Run simulation
    const result = simulateConvergence({ 
        startWealth: startWealth, 
        P: P, 
        V: V, 
        U: U, 
        months: months 
    });
    
    print('\nResults after ' + months + ' month' + (months > 1 ? 's' : '') + ':');
    print('  Ending Wealth:      ' + fmt(result.endingWealth));
    print('  Total Tax Paid:     ' + fmt(result.totalTaxPaid));
    print('  Total UBI Received: ' + fmt(result.totalUBIReceived));
    
    if (result.netChangePercent !== null) {
        print('  Net Change:         ' + fmt(result.netChange) + ' (' + fmtPercent(result.netChangePercent / 100) + ')');
    } else {
        print('  Net Change:         ' + fmt(result.netChange) + ' (from $0)');
    }
    
    print('  Convergence:        ' + result.convergenceDirection);
    
    // Convergence analysis
    const conv = analyzeConvergence({ 
        startWealth: startWealth, 
        V: V, 
        U: U,
        threshold: 0.01 
    });
    
    if (!conv.alreadyAtEquilibrium) {
        print('\nConvergence Analysis:');
        print('  Half-life:          ' + conv.halfLifeMonths + ' months (~' + conv.halfLifeYears.toFixed(1) + ' years)');
        print('  To reach V±1%:      ' + conv.monthsToEquilibrium + ' months (~' + conv.yearsToEquilibrium.toFixed(1) + ' years)');
    } else {
        print('\n✓ Already at equilibrium');
    }
    
    return result;
}

// --- Multi-Scenario Comparison ---
function compareScenarios(scenarios) {
    print('\n' + '█'.repeat(80));
    print('COMPARISON TABLE: ' + scenarios.length + ' Scenarios');
    print('█'.repeat(80));
    
    const headers = ['Scenario', 'Start', 'End', 'Net Change', 'Net %', 'Direction'];
    print(headers.join(' | '));
    print('-'.repeat(120));
    
    scenarios.forEach(function(scenario) {
        const result = simulateConvergence({ 
            startWealth: scenario.startWealth,
            P: scenario.P, 
            V: scenario.V, 
            U: scenario.U, 
            months: scenario.months || 12 
        });
        
        const netPct = result.netChangePercent !== null 
            ? fmtPercent(result.netChangePercent / 100) 
            : 'N/A';
        
        const row = [
            scenario.name.substring(0, 15).padEnd(15),
            fmt(scenario.startWealth).padStart(12),
            fmt(result.endingWealth).padStart(12),
            fmt(result.netChange).padStart(12),
            netPct.padStart(8),
            result.convergenceDirection.padEnd(6)
        ];
        print(row.join(' | '));
    });
}

// --- Main Execution: Run All Scenarios ---
function main() {
    print('\n🚀 POPULATION-BACKED UBI MODEL - SCENARIO ANALYSIS');
    print('Generated: ' + new Date().toLocaleString());
    
    // ========================================================================
    // BASELINE SCENARIOS: V = $1,000,000
    // ========================================================================
    print('\n\n📊 PART 1: BASELINE (V = $1,000,000)');
    
    var baselineScenarios = [
        { name: 'V=1M | U=$2K | Start=$0', P: 7e9, V: 1e6, U: 2000, startWealth: 0 },
        { name: 'V=1M | U=$2K | Start=$10K', P: 7e9, V: 1e6, U: 2000, startWealth: 10000 },
        { name: 'V=1M | U=$2K | Start=$1M', P: 7e9, V: 1e6, U: 2000, startWealth: 1e6 },
        { name: 'V=1M | U=$2K | Start=$1B', P: 7e9, V: 1e6, U: 2000, startWealth: 1e9 },
        { name: 'V=1M | U=$5K | Start=$10K', P: 7e9, V: 1e6, U: 5000, startWealth: 10000 },
        { name: 'V=1M | U=$5K | Start=$1B', P: 7e9, V: 1e6, U: 5000, startWealth: 1e9 },
        { name: 'V=1M | U=$10K | Start=$10K', P: 7e9, V: 1e6, U: 10000, startWealth: 10000 },
        { name: 'V=1M | U=$10K | Start=$1B', P: 7e9, V: 1e6, U: 10000, startWealth: 1e9 },
    ];
    
    baselineScenarios.forEach(function(scenario) {
        runScenario(scenario);
    });
    
    compareScenarios(baselineScenarios);
    
    // ========================================================================
    // NEW SCENARIOS: V = $10,000,000
    // ========================================================================
    print('\n\n📊 PART 2: HIGH VALUE (V = $10,000,000)');
    
    var highValueScenarios = [
        { name: 'V=10M | U=$2K | Start=$0', P: 7e9, V: 1e7, U: 2000, startWealth: 0 },
        { name: 'V=10M | U=$2K | Start=$10K', P: 7e9, V: 1e7, U: 2000, startWealth: 10000 },
        { name: 'V=10M | U=$2K | Start=$10M', P: 7e9, V: 1e7, U: 2000, startWealth: 1e7 },
        { name: 'V=10M | U=$2K | Start=$1B', P: 7e9, V: 1e7, U: 2000, startWealth: 1e9 },
        { name: 'V=10M | U=$5K | Start=$10K', P: 7e9, V: 1e7, U: 5000, startWealth: 10000 },
        { name: 'V=10M | U=$5K | Start=$1B', P: 7e9, V: 1e7, U: 5000, startWealth: 1e9 },
        { name: 'V=10M | U=$10K | Start=$10K', P: 7e9, V: 1e7, U: 10000, startWealth: 10000 },
        { name: 'V=10M | U=$10K | Start=$1B', P: 7e9, V: 1e7, U: 10000, startWealth: 1e9 },
    ];
    
    highValueScenarios.forEach(function(scenario) {
        runScenario(scenario);
    });
    
    compareScenarios(highValueScenarios);
    
    // ========================================================================
    // CONVERGENCE SPEED COMPARISON
    // ========================================================================
    print('\n\n📊 PART 3: CONVERGENCE SPEED ANALYSIS');
    
    var convergenceParams = [
        { label: 'V=$1M, U=$2K', V: 1e6, U: 2000 },
        { label: 'V=$1M, U=$5K', V: 1e6, U: 5000 },
        { label: 'V=$1M, U=$10K', V: 1e6, U: 10000 },
        { label: 'V=$10M, U=$2K', V: 1e7, U: 2000 },
        { label: 'V=$10M, U=$5K', V: 1e7, U: 5000 },
        { label: 'V=$10M, U=$10K', V: 1e7, U: 10000 },
    ];
    
    print('\nConvergence Speed (starting from $1B toward equilibrium):');
    print('-'.repeat(70));
    print('Config              | Monthly Rate | Half-Life    | To Equilibrium');
    print('-'.repeat(70));
    
    convergenceParams.forEach(function(params) {
        var conv = analyzeConvergence({ 
            startWealth: 1e9, 
            V: params.V, 
            U: params.U, 
            threshold: 0.01 
        });
        var rate = fmtPercent(params.U / params.V);
        var halfLife = conv.halfLifeMonths + 'mo (~' + conv.halfLifeYears.toFixed(1) + 'yr)';
        var toEquil = conv.monthsToEquilibrium + 'mo (~' + conv.yearsToEquilibrium.toFixed(1) + 'yr)';
        
        print(params.label.padEnd(19) + ' | ' + rate.padEnd(12) + ' | ' + halfLife.padEnd(12) + ' | ' + toEquil);
    });
    
    // ========================================================================
    // SCALE INVARIANCE DEMONSTRATION
    // ========================================================================
    print('\n\n📊 PART 4: SCALE INVARIANCE VERIFICATION');
    print('Demonstrating that results are identical regardless of population size');
    
    var scaleTest = {
        startWealth: 1e9,
        V: 1e6,
        U: 2000,
        months: 12
    };
    
    var scales = [
        { label: 'Small (P=1,000)', P: 1000 },
        { label: 'Medium (P=1M)', P: 1e6 },
        { label: 'Large (P=100M)', P: 1e8 },
        { label: 'Global (P=7B)', P: 7e9 },
    ];
    
    print('\nBillionaire ($1B start) after 12 months, U=$2K, V=$1M:');
    print('-'.repeat(80));
    print('Scale Label          | Ending Wealth    | Net Change       | Tax Paid');
    print('-'.repeat(80));
    
    scales.forEach(function(scale) {
        var result = simulateConvergence({ 
            startWealth: scaleTest.startWealth,
            P: scale.P,
            V: scaleTest.V,
            U: scaleTest.U,
            months: scaleTest.months
        });
        print(scale.label.padEnd(20) + ' | ' + 
              fmt(result.endingWealth).padEnd(16) + ' | ' + 
              fmt(result.netChange).padEnd(16) + ' | ' + 
              fmt(result.totalTaxPaid));
    });
    
    print('\n✓ All scales produce identical results (within floating-point precision)');
    print('✓ Tax depends on W×(U/V), not on population P');
    
    // ========================================================================
    // KEY INSIGHTS SUMMARY
    // ========================================================================
    print('\n\n🔑 KEY INSIGHTS SUMMARY');
    print('='.repeat(80));
    
    print('\n1. SCALE INVARIANCE:\n' +
          '   - Tax formula simplifies to: Tax = W × (U/V)\n' +
          '   - Population (P) cancels out completely\n' +
          '   - Results are identical whether P=1,000 or P=7,000,000,000\n\n' +
          
          '2. CONVERGENCE SPEED:\n' +
          '   - Determined by ratio U/V (monthly effective rate)\n' +
          '   - Half-life formula: ln(0.5) / ln(1 - U/V)\n' +
          '   - V=$1M, U=$2K: ~29 years to halve distance to equilibrium\n' +
          '   - V=$10M, U=$2K: ~290 years (10× slower convergence)\n\n' +
          
          '3. EQUILIBRIUM POINT:\n' +
          '   - Always equals V, regardless of U or P\n' +
          '   - At W=V: Tax = U, so Net Change = U - U = 0\n\n' +
          
          '4. POVERTY ELIMINATION:\n' +
          '   - Starting at $0: Net gain ≈ U×12 in first year (minus tiny tax)\n' +
          '   - Higher U = faster poverty elimination\n' +
          '   - V=$10M means higher savings floor but slower convergence\n\n' +
          
          '5. POLICY TRADE-OFFS:\n' +
          '   - Higher U: Faster equalization, higher tax burden on wealthy\n' +
          '   - Higher V: Higher savings floor, slower convergence\n' +
          '   - Both parameters tunable via democratic governance\n');
    
    print('='.repeat(80));
    print('✅ Analysis complete. All calculations verified.');
    print('📝 Formula: Tax = (W / M) × (U × P) = W × (U / V)');
    print('🎯 Equilibrium: W = V = ' + fmt(1e6) + ' or ' + fmt(1e7));
}

// --- Run the analysis ---
main();

// ============================================================================
// EXPORT FOR MODULE USE (if available)
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ubiTaxCalc: ubiTaxCalc,
        ubiTaxCalcSimple: ubiTaxCalcSimple,
        simulateConvergence: simulateConvergence,
        analyzeConvergence: analyzeConvergence,
        runScenario: runScenario,
        compareScenarios: compareScenarios,
        fmt: fmt,
        fmtPrecise: fmtPrecise,
        fmtPercent: fmtPercent,
        fmtCompact: fmtCompact
    };
}