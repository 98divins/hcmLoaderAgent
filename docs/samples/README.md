# Jeux d'essai

UTF-8 avec BOM, separateur point-virgule, fins de ligne CRLF : ce que produit et
relit un Excel francais. Les accents sont volontaires, ils verifient l'encodage
jusque dans le .dat.

Chaque anomalie est deliberee et vise une regle precise du controle.

## Dossier Location (operation MERGE)

`Location.csv` puis `LocationOtherAddress.csv` dans une seconde feuille.

| Ligne | Ce qu'elle eprouve |
|---|---|
| Location L1 et L5 | meme LocationCode + SetCode : doublon de cle utilisateur |
| Location L3 | SetCode vide et date en jj/mm/aaaa : deux corrections automatiques |
| Location L4 | ActiveStatus vide : avertissement, pas blocage |
| Adresse L1 et L2 | AddressUsageType vide : colonne de cle, blocage, valeur non devinable |
| Adresse L3 | NCE01 absent de la feuille parent : rapprochement avec le tenant |

## Dossier Organization (operation MERGE)

`Organization.csv` puis `OrgUnitClassification.csv`.

| Ligne | Ce qu'elle eprouve |
|---|---|
| Organization L2 | date en jj/mm/aaaa : correction automatique |
| Classification L2 | SetCode vide sur DEPARTMENT : regle conditionnelle |
| Classification L4 | Logistique Nord absent de la feuille parent |
| Classification, toutes | CategoryCode vide : declare obligatoire, accepte vide |

## Deux valeurs a confirmer dans le tenant

`AddressUsageType` n'est renseigne nulle part : sa valeur ne se devine pas, et
c'est exactement ce que l'assistant doit demander plutot qu'inventer.

`ClassificationName` vaut "Department". Le code `DEPARTMENT` est etabli, le
libelle affiche ne l'est pas : il vient de HR_ORG_CLASSIFICATIONS_VL et depend
de la langue du pod. Comme il fait partie de la cle utilisateur d'une
organisation, une valeur fausse cree un doublon au lieu de mettre a jour.
