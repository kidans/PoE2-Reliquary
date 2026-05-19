use std::{fs, path::Path};

use fuzzy_matcher::{skim::SkimMatcherV2, FuzzyMatcher};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HazardCatalog {
    pub banned_mods: Vec<String>,
}

pub fn load_hazard_catalog(path: impl AsRef<Path>) -> Result<HazardCatalog, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
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

fn normalized_contains(modifier: &str, banned: &str) -> bool {
    modifier.to_lowercase().contains(&banned.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::{check_waystone_hazards, HazardCatalog};

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
}
