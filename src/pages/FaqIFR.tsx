export default function FaqIFR() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">

      <h1 className="text-5xl font-bold mb-8">
        FAQ IFR EASA : Questions fréquentes
      </h1>

      <p className="text-xl mb-12">
        Retrouvez les réponses aux questions les plus fréquentes sur la qualification
        IFR, la réglementation EASA, les sélections compagnies aériennes et le
        renouvellement IR.
      </p>

      <div className="space-y-10">

        <div>
          <h2 className="text-2xl font-bold mb-3">
            Qu'est-ce qu'une qualification IR ?
          </h2>
          <p>
            La qualification IR (Instrument Rating) permet de voler selon les
            règles IFR et d'évoluer dans les nuages ou avec une visibilité réduite.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">
            Quelle est la durée de validité d'un IR EASA ?
          </h2>
          <p>
            La qualification IR doit être prorogée périodiquement conformément
            à la réglementation EASA.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">
            Quelle différence entre prorogation et renouvellement IR ?
          </h2>
          <p>
            Une prorogation concerne une qualification encore valide.
            Un renouvellement concerne une qualification expirée.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">
            Comment préparer efficacement un contrôle IR ?
          </h2>
          <p>
            Une préparation rigoureuse des procédures IFR, approches, attentes
            et réglementation reste essentielle.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">
            Que sont les procédures SID et STAR ?
          </h2>
          <p>
            Les SID sont des procédures normalisées de départ.
            Les STAR sont des procédures normalisées d'arrivée IFR.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">
            Quelle différence entre une approche ILS et RNAV ?
          </h2>
          <p>
            L'ILS utilise des aides radio au sol tandis que l'approche RNAV
            s'appuie principalement sur la navigation GNSS.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">
            La formation convient-elle aux sélections compagnies ?
          </h2>
          <p>
            Oui. Les connaissances IFR sont fréquemment évaluées lors des
            assessments et entretiens techniques.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">
            Combien d'heures de formation contient AviationOnline ?
          </h2>
          <p>
            La plateforme regroupe l'ensemble des connaissances IFR nécessaires
            à la préparation IR EASA et aux sélections pilotes de ligne.
          </p>
        </div>

      </div>

      <div className="mt-16 p-8 bg-blue-50 rounded-2xl">
        <h2 className="text-3xl font-bold mb-4">
          Besoin d'une préparation IFR complète ?
        </h2>

        <p className="mb-6">
          Accédez à l'ensemble de la formation IFR développée par
          Jean-Claude Chenard.
        </p>

        <a
          href="/login"
          className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold"
        >
          Accéder à la formation
        </a>
      </div>

    </div>
  );
}
