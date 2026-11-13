//! afterstep-gen: write daily levels as JSON.
//!
//! Usage:
//!   afterstep-gen daily <out_dir> <from YYYY-MM-DD> <days>   generate missing daily levels
//!   afterstep-gen check <level.json>...                        verify levels (solvable, needs echo, needs a bump
//!                                                              where `needsBump` says so) and print each nudge

use afterstep_engine::gen::{generate, Params, Rng};
use afterstep_engine::nudge::nudge;
use afterstep_engine::solver::{solve, solve_in_sync, solve_without_echo};
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
        let r = verdict(&v);
        println!("{} {f}: {}", if r.ok { "ok " } else { "BAD" }, r.line);
        bad += !r.ok as usize;
        generic += r.generic as usize;
    }
    println!("{} levels, {bad} bad, {generic} with a generic nudge", files.len());
    if bad > 0 {
        exit(1);
    }
}

struct Verdict {
    ok: bool,
    generic: bool,
    line: String,
}

/// Check one level: solvable (at its par, if it has one), not solvable alone
/// unless `needsEcho` is false, and, if `needsBump` is true, not solvable with
/// the echo in step (every win needs it to bump a door on purpose).
fn verdict(v: &Value) -> Verdict {
    let rows: Vec<&str> = v["grid"].as_array().unwrap().iter().map(|r| r.as_str().unwrap()).collect();
    let delay = v["delay"].as_u64().unwrap() as usize;
    let level = Level::parse(&rows, delay).unwrap();
    let needs_echo = v.get("needsEcho").and_then(Value::as_bool).unwrap_or(true);
    let needs_bump = v.get("needsBump").and_then(Value::as_bool).unwrap_or(false);
    let sol = solve(&level, 2_000_000);
    let alone = solve_without_echo(&level, 2_000_000);
    // Out of budget proves nothing, so it doesn't count as needing a bump.
    let bump = needs_bump.then(|| matches!(solve_in_sync(&level, 2_000_000), Ok(None)));
    let par = v["par"].as_u64().map(|p| p as usize);
    let ok = match &sol {
        Some(s) => par.map_or(true, |p| p == s.moves.len()) && (!needs_echo || alone.is_none()) && bump != Some(false),
        None => false,
    };
    let n = nudge(&level, 2_000_000);
    let line = format!(
        "par {:?} solver {:?} alone-solvable {}{} nudge {:?}{}",
        par,
        sol.as_ref().map(|s| s.moves.as_str()),
        alone.is_some(),
        bump.map_or(String::new(), |b| format!(" needs bump {b}")),
        n.text(),
        if n.is_generic() { " (generic)" } else { "" }
    );
    Verdict { ok, generic: n.is_generic(), line }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lesson(n: usize) -> Value {
        let path = format!("{}/../levels/tutorial/{n}.json", env!("CARGO_MANIFEST_DIR"));
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn check_passes_every_lesson() {
        for n in 1..=5 {
            assert!(verdict(&lesson(n)).ok, "lesson {n}: {}", verdict(&lesson(n)).line);
        }
    }

    #[test]
    fn needs_bump_is_checked_with_the_echo_in_sync() {
        // Lesson 5 says so and is right: it says so in the report, too.
        let v = verdict(&lesson(5));
        assert!(v.ok && v.line.contains("needs bump true"), "{}", v.line);
        // Lesson 2 is won with the echo in step all the way.
        let mut two = lesson(2);
        two["needsBump"] = json!(true);
        let v = verdict(&two);
        assert!(!v.ok && v.line.contains("needs bump false"), "{}", v.line);
        // Without the flag nothing is claimed, so nothing is searched.
        assert!(!verdict(&lesson(2)).line.contains("needs bump"));
    }
}
