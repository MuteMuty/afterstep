//! afterstep-gen: write daily levels as JSON.
//!
//! Usage:
//!   afterstep-gen daily <out_dir> <from YYYY-MM-DD> <days>   generate missing daily levels
//!   afterstep-gen check <level.json>...                        verify levels (solvable, needs echo) and print each nudge

use afterstep_engine::gen::{generate, Params, Rng};
use afterstep_engine::nudge::nudge;
use afterstep_engine::solver::{solve, solve_without_echo};
use afterstep_engine::Level;
use serde_json::{json, Value};
use std::path::Path;
use std::process::exit;

const EPOCH: (i64, i64, i64) = (2026, 11, 10); // puzzle #1

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn parse_date(s: &str) -> i64 {
    let p: Vec<i64> = s.split('-').map(|x| x.parse().expect("date")).collect();
    days_from_civil(p[0], p[1], p[2])
}

/// Mon/Tue easy, Wed/Thu medium, Fri medium, Sat/Sun hard.
fn tier_for(day: i64) -> &'static str {
    // 1970-01-01 was a Thursday.
    match (day + 3).rem_euclid(7) {
        0 | 1 => "easy",
        2 | 3 | 4 => "medium",
        _ => "hard",
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("daily") if args.len() == 5 => daily(&args[2], &args[3], args[4].parse().expect("days")),
        Some("check") if args.len() > 2 => check(&args[2..]),
        _ => {
            eprintln!("usage: afterstep-gen daily <out_dir> <from YYYY-MM-DD> <days> | check <file>...");
            exit(2);
        }
    }
}

fn daily(out: &str, from: &str, days: i64) {
    let epoch = days_from_civil(EPOCH.0, EPOCH.1, EPOCH.2);
    let start = parse_date(from);
    std::fs::create_dir_all(out).unwrap();
    for day in start..start + days {
        let (y, m, d) = civil_from_days(day);
        let date = format!("{y:04}-{m:02}-{d:02}");
        let path = Path::new(out).join(format!("{date}.json"));
        if path.exists() {
            println!("{date}: exists, kept");
            continue;
        }
        let tier = tier_for(day);
        let params = Params::tier(tier).unwrap();
        let mut rng = Rng::from_str(&format!("afterstep:{date}"));
        let Some(g) = generate(&params, &mut rng, 200_000) else {
            eprintln!("{date}: no level found for tier {tier}");
            exit(1);
        };
        let v = json!({
            "id": day - epoch + 1,
            "date": date,
            "tier": tier,
            "delay": g.level.delay,
            "par": g.solution.len(),
            "grid": g.level.to_rows(),
            "solution": g.solution,
            "explored": g.explored,
            "desync": g.desync,
        });
        std::fs::write(&path, serde_json::to_string_pretty(&v).unwrap() + "\n").unwrap();
        println!("{date}: #{} {tier} par {} explored {} desync {}", day - epoch + 1, g.solution.len(), g.explored, g.desync);
    }
}

fn check(files: &[String]) {
    let (mut bad, mut generic) = (0, 0);
    for f in files {
        let v: Value = serde_json::from_str(&std::fs::read_to_string(f).unwrap()).unwrap();
        let rows: Vec<&str> = v["grid"].as_array().unwrap().iter().map(|r| r.as_str().unwrap()).collect();
        let delay = v["delay"].as_u64().unwrap() as usize;
        let level = Level::parse(&rows, delay).unwrap();
        let needs_echo = v.get("needsEcho").and_then(Value::as_bool).unwrap_or(true);
        let sol = solve(&level, 2_000_000);
        let alone = solve_without_echo(&level, 2_000_000);
        let par = v["par"].as_u64().map(|p| p as usize);
        let ok = match &sol {
            Some(s) => par.map_or(true, |p| p == s.moves.len()) && (!needs_echo || alone.is_none()),
            None => false,
        };
        let n = nudge(&level, 2_000_000);
        generic += n.is_generic() as usize;
        println!(
            "{} {f}: par {:?} solver {:?} alone-solvable {} nudge {:?}{}",
            if ok { "ok " } else { "BAD" },
            par,
            sol.as_ref().map(|s| s.moves.as_str()),
            alone.is_some(),
            n.text(),
            if n.is_generic() { " (generic)" } else { "" }
        );
        if !ok {
            bad += 1;
        }
    }
    println!("{} levels, {bad} bad, {generic} with a generic nudge", files.len());
    if bad > 0 {
        exit(1);
    }
}
