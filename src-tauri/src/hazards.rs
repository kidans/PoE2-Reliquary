use std::{fs, path::Path};

use fuzzy_matcher::{skim::SkimMatcherV2, FuzzyMatcher};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HazardCatalog {
    pub banned_mods: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HazardSeverity {
    Info,
    Warning,
    Danger,
    BuildBreaking,
}

impl HazardSeverity {
    fn rank(self) -> u8 {
        match self {
            HazardSeverity::Info => 0,
            HazardSeverity::Warning => 1,
            HazardSeverity::Danger => 2,
            HazardSeverity::BuildBreaking => 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HazardProfileRule {
    pub pattern: String,
    pub severity: HazardSeverity,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HazardProfile {
    pub id: String,
    pub label: String,
    pub rules: Vec<HazardProfileRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaystoneHazardWarning {
    pub modifier: String,
    pub matched_pattern: String,
    pub severity: HazardSeverity,
    pub profile_id: String,
    pub profile_label: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HazardSummary {
    pub info: usize,
    pub warning: usize,
    pub danger: usize,
    pub build_breaking: usize,
}

impl HazardSummary {
    pub fn from_warnings(warnings: &[WaystoneHazardWarning]) -> Self {
        let mut summary = Self::default();
        for warning in warnings {
            match warning.severity {
                HazardSeverity::Info => summary.info += 1,
                HazardSeverity::Warning => summary.warning += 1,
                HazardSeverity::Danger => summary.danger += 1,
                HazardSeverity::BuildBreaking => summary.build_breaking += 1,
            }
        }
        summary
    }

    pub fn total(&self) -> usize {
        self.info + self.warning + self.danger + self.build_breaking
    }
}

pub fn load_hazard_catalog(path: impl AsRef<Path>) -> Result<HazardCatalog, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

pub fn default_hazard_profiles() -> Vec<HazardProfile> {
    vec![
        HazardProfile {
            id: "general_safe_mapping".to_string(),
            label: "General Safe Mapping".to_string(),
            rules: vec![
                rule(
                    "reduced Recovery Rate",
                    HazardSeverity::Danger,
                    "Recovery penalties are broadly dangerous and can make mistakes harder to recover from.",
                ),
                rule(
                    "Monsters penetrate",
                    HazardSeverity::Warning,
                    "Resistance penetration can create unexpected damage spikes.",
                ),
                rule(
                    "Reflect",
                    HazardSeverity::BuildBreaking,
                    "Reflect can brick affected builds and should be treated as unsafe unless intentionally supported.",
                ),
            ],
        },
        HazardProfile {
            id: "energy_shield_recovery".to_string(),
            label: "Energy Shield / Recovery".to_string(),
            rules: vec![
                rule(
                    "reduced Recovery Rate",
                    HazardSeverity::BuildBreaking,
                    "Reduced recovery is especially punishing for Energy Shield and recovery-based defensive layers.",
                ),
                rule(
                    "cannot Regenerate",
                    HazardSeverity::BuildBreaking,
                    "No regeneration can brick builds that rely on regen to stabilize Energy Shield, Life, or Mana.",
                ),
                rule(
                    "less Recovery",
                    HazardSeverity::Danger,
                    "Less recovery directly weakens sustain and recovery windows.",
                ),
                rule(
                    "Monsters penetrate",
                    HazardSeverity::Danger,
                    "Penetration can bypass a large part of the build's effective elemental mitigation.",
                ),
            ],
        },
        HazardProfile {
            id: "minion".to_string(),
            label: "Minion".to_string(),
            rules: vec![
                rule(
                    "Monsters deal",
                    HazardSeverity::Warning,
                    "Generic monster damage increases can wipe minions or force defensive repositioning.",
                ),
                rule(
                    "Area contains patches",
                    HazardSeverity::Warning,
                    "Ground effects can be hard to control for minion builds during dense fights.",
                ),
                rule(
                    "reduced Recovery Rate",
                    HazardSeverity::Danger,
                    "Reduced recovery can make it harder to recover from chip damage while minions ramp.",
                ),
            ],
        },
        HazardProfile {
            id: "armour".to_string(),
            label: "Armour".to_string(),
            rules: vec![
                rule(
                    "Monsters Overwhelm",
                    HazardSeverity::Danger,
                    "Overwhelm directly cuts through armour mitigation and can create physical damage spikes.",
                ),
                rule(
                    "less Armour",
                    HazardSeverity::Danger,
                    "Armour reduction weakens the build's primary physical mitigation layer.",
                ),
                rule(
                    "Monsters deal",
                    HazardSeverity::Warning,
                    "Extra monster damage increases the pressure on armour recovery windows.",
                ),
            ],
        },
        HazardProfile {
            id: "evasion".to_string(),
            label: "Evasion".to_string(),
            rules: vec![
                rule(
                    "Monsters have increased Accuracy",
                    HazardSeverity::Danger,
                    "Accuracy bonuses reduce the value of evasion and make avoidance less reliable.",
                ),
                rule(
                    "Monsters cannot be Blinded",
                    HazardSeverity::Warning,
                    "Blind immunity weakens evasion-layered defenses that rely on accuracy suppression.",
                ),
                rule(
                    "Monsters deal",
                    HazardSeverity::Warning,
                    "Large monster damage bonuses are dangerous when avoidance fails.",
                ),
            ],
        },
        HazardProfile {
            id: "flask_sustain".to_string(),
            label: "Flask Sustain".to_string(),
            rules: vec![
                rule(
                    "reduced Flask Charges",
                    HazardSeverity::Danger,
                    "Reduced flask charge generation can disable uptime for builds that rely on flasks.",
                ),
                rule(
                    "Players gain reduced Flask Charges",
                    HazardSeverity::Danger,
                    "Reduced flask charges directly weakens sustain and panic recovery.",
                ),
                rule(
                    "less Recovery",
                    HazardSeverity::Warning,
                    "Recovery penalties make flask downtime more punishing.",
                ),
            ],
        },
        HazardProfile {
            id: "bossing".to_string(),
            label: "Bossing".to_string(),
            rules: vec![
                rule(
                    "Unique Boss",
                    HazardSeverity::Warning,
                    "Boss modifiers can turn otherwise safe maps into burst-damage checks.",
                ),
                rule(
                    "Monsters deal",
                    HazardSeverity::Warning,
                    "Extra monster damage is especially dangerous during boss arenas.",
                ),
                rule(
                    "Monsters have increased Area of Effect",
                    HazardSeverity::Warning,
                    "Larger boss and rare monster skills reduce dodge space.",
                ),
            ],
        },
        HazardProfile {
            id: "xp_safe".to_string(),
            label: "XP-safe".to_string(),
            rules: vec![
                rule(
                    "Monsters deal",
                    HazardSeverity::Danger,
                    "XP-safe mapping should avoid broad monster damage multipliers.",
                ),
                rule(
                    "Monsters penetrate",
                    HazardSeverity::Danger,
                    "Penetration is a common source of unexpected deaths during XP pushes.",
                ),
                rule(
                    "Area contains patches",
                    HazardSeverity::Warning,
                    "Ground effects add avoidable death risk during fast clear.",
                ),
            ],
        },
    ]
}

pub fn profile_by_id(profile_id: &str) -> HazardProfile {
    default_hazard_profiles()
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .unwrap_or_else(|| default_hazard_profiles().remove(0))
}

pub fn check_waystone_hazards(modifiers: &[String], catalog: &HazardCatalog) -> Vec<String> {
    let matcher = SkimMatcherV2::default();

    modifiers
        .iter()
        .filter(|modifier| {
            catalog.banned_mods.iter().any(|banned| {
                normalized_contains(modifier, banned)
                    || matcher.fuzzy_match(&modifier.to_lowercase(), &banned.to_lowercase())
                        >= Some(60)
            })
        })
        .cloned()
        .collect()
}

pub fn check_waystone_profile_hazards(
    modifiers: &[String],
    profile: &HazardProfile,
) -> Vec<WaystoneHazardWarning> {
    let matcher = SkimMatcherV2::default();
    let mut warnings = Vec::new();

    for modifier in modifiers {
        let best_rule = profile
            .rules
            .iter()
            .filter(|rule| hazard_rule_matches(modifier, &rule.pattern, &matcher))
            .max_by_key(|rule| rule.severity.rank());

        if let Some(rule) = best_rule {
            warnings.push(WaystoneHazardWarning {
                modifier: modifier.clone(),
                matched_pattern: rule.pattern.clone(),
                severity: rule.severity,
                profile_id: profile.id.clone(),
                profile_label: profile.label.clone(),
                reason: rule.reason.clone(),
            });
        }
    }

    warnings
}

fn hazard_rule_matches(modifier: &str, pattern: &str, matcher: &SkimMatcherV2) -> bool {
    normalized_contains(modifier, pattern)
        || matcher.fuzzy_match(&modifier.to_lowercase(), &pattern.to_lowercase()) >= Some(60)
}

fn normalized_contains(modifier: &str, banned: &str) -> bool {
    modifier.to_lowercase().contains(&banned.to_lowercase())
}

fn rule(pattern: &str, severity: HazardSeverity, reason: &str) -> HazardProfileRule {
    HazardProfileRule {
        pattern: pattern.to_string(),
        severity,
        reason: reason.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        check_waystone_hazards, check_waystone_profile_hazards, default_hazard_profiles,
        HazardCatalog, HazardSeverity, HazardSummary,
    };

    #[test]
    fn returns_matching_hazard_modifiers() {
        let catalog = HazardCatalog {
            banned_mods: vec!["reduced Recovery Rate".to_string(), "Reflect".to_string()],
        };
        let modifiers = vec![
            "Area contains patches of Burning Ground".to_string(),
            "Players have 40% reduced Recovery Rate of Life and Energy Shield".to_string(),
        ];

        let hazards = check_waystone_hazards(&modifiers, &catalog);

        assert_eq!(
            hazards,
            vec!["Players have 40% reduced Recovery Rate of Life and Energy Shield"]
        );
    }

    #[test]
    fn returns_build_aware_profile_warnings() {
        let profile = default_hazard_profiles()
            .into_iter()
            .find(|profile| profile.id == "energy_shield_recovery")
            .unwrap();
        let modifiers = vec![
            "Players have 40% reduced Recovery Rate of Life and Energy Shield".to_string(),
            "Monsters penetrate 10% Elemental Resistances".to_string(),
        ];

        let warnings = check_waystone_profile_hazards(&modifiers, &profile);

        assert_eq!(warnings.len(), 2);
        assert_eq!(warnings[0].severity, HazardSeverity::BuildBreaking);
        assert_eq!(warnings[1].severity, HazardSeverity::Danger);
    }

    #[test]
    fn summarizes_profile_warning_severity() {
        let profile = default_hazard_profiles()
            .into_iter()
            .find(|profile| profile.id == "general_safe_mapping")
            .unwrap();
        let modifiers = vec![
            "Players have 40% reduced Recovery Rate of Life and Energy Shield".to_string(),
            "Monsters penetrate 10% Elemental Resistances".to_string(),
            "Elemental Damage Reflected to Players".to_string(),
        ];

        let warnings = check_waystone_profile_hazards(&modifiers, &profile);
        let summary = HazardSummary::from_warnings(&warnings);

        assert_eq!(summary.warning, 1);
        assert_eq!(summary.danger, 1);
        assert_eq!(summary.build_breaking, 1);
        assert_eq!(summary.total(), 3);
    }

    #[test]
    fn armour_profile_flags_armour_specific_mods() {
        let profile = default_hazard_profiles()
            .into_iter()
            .find(|profile| profile.id == "armour")
            .unwrap();
        let modifiers = vec![
            "Monsters Overwhelm 35% Physical Damage Reduction".to_string(),
            "Players have 40% less Armour".to_string(),
        ];

        let warnings = check_waystone_profile_hazards(&modifiers, &profile);

        assert_eq!(warnings.len(), 2);
        assert!(warnings
            .iter()
            .all(|warning| warning.severity == HazardSeverity::Danger));
    }

    #[test]
    fn evasion_profile_flags_accuracy_but_not_safe_pack_size() {
        let profile = default_hazard_profiles()
            .into_iter()
            .find(|profile| profile.id == "evasion")
            .unwrap();
        let modifiers = vec![
            "Monsters have 38% increased Accuracy Rating".to_string(),
            "9% increased Pack Size".to_string(),
        ];

        let warnings = check_waystone_profile_hazards(&modifiers, &profile);

        assert_eq!(warnings.len(), 1);
        assert_eq!(
            warnings[0].matched_pattern,
            "Monsters have increased Accuracy"
        );
    }

    #[test]
    fn flask_profile_flags_reduced_flask_charges() {
        let profile = default_hazard_profiles()
            .into_iter()
            .find(|profile| profile.id == "flask_sustain")
            .unwrap();
        let modifiers = vec![
            "Players gain 34% reduced Flask Charges".to_string(),
            "12% increased Rarity of Items found in this Area".to_string(),
        ];

        let warnings = check_waystone_profile_hazards(&modifiers, &profile);

        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].severity, HazardSeverity::Danger);
    }
}
