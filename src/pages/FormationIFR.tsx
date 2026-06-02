export default function FormationIFR() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">

      <h1 className="text-5xl font-bold mb-8">
        Formation IFR en ligne
      </h1>

      <p className="text-xl mb-8">
        Formation IFR en ligne conçue par Jean-Claude Chenard,
        instructeur IFR / MCCI avec plus de 25 000 heures
        d'instruction sur simulateur.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Préparation IR EASA
      </h2>

      <p className="mb-6">
        Cette formation couvre l'ensemble des procédures IFR :
        radionavigation, SID, STAR, attentes, approches de précision,
        approches GNSS, réglementation et préparation aux sélections
        compagnies aériennes.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Pourquoi choisir AviationOnline ?
      </h2>

      <ul className="list-disc pl-6 space-y-2">
        <li>Plus de 500 slides pédagogiques</li>
        <li>11 heures de vidéos</li>
        <li>260 QCM corrigés</li>
        <li>Accès illimité</li>
        <li>Mise à jour continue</li>
      </ul>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Programme de la formation IFR
      </h2>

      <p className="mb-6">
        La formation couvre l'ensemble des compétences IFR requises pour
        préparer une qualification IR EASA ou réussir une sélection en
        compagnie aérienne.
      </p>

      <ul className="list-disc pl-6 space-y-2">
        <li>Radio-navigation VOR, NDB, DME</li>
        <li>SID et STAR</li>
        <li>Procédures d'attente</li>
        <li>Approches ILS</li>
        <li>Approches RNAV GNSS</li>
        <li>Réglementation IFR</li>
        <li>Météorologie IFR</li>
        <li>Facteurs humains</li>
        <li>Gestion de la charge de travail</li>
        <li>Préparation aux sélections compagnies aériennes</li>
      </ul>

      <h2 className="text-3xl font-bold mt-12 mb-6">
        Questions fréquentes sur la formation IFR
      </h2>

      <div className="space-y-6">

        <div>
          <h3 className="text-xl font-bold mb-2">
            Qu'est-ce qu'une qualification IR ?
          </h3>
          <p>
            La qualification Instrument Rating (IR) permet à un pilote de
            voler selon les règles IFR et d'effectuer des vols en conditions
            météorologiques dégradées en utilisant exclusivement les
            instruments de bord.
          </p>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2">
            Cette formation IFR est-elle adaptée à la préparation IR EASA ?
          </h3>
          <p>
            Oui. La formation couvre les principaux thèmes rencontrés lors
            d'une qualification IR EASA : radionavigation, procédures IFR,
            approches, réglementation et gestion de la charge de travail.
          </p>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2">
            Puis-je suivre la formation à mon rythme ?
          </h3>
          <p>
            Oui. L'accès est disponible en ligne et sans limitation de durée
            afin de permettre un apprentissage flexible.
          </p>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2">
            Cette formation convient-elle aux sélections compagnies aériennes ?
          </h3>
          <p>
            Oui. Une bonne maîtrise des procédures IFR constitue un élément
            essentiel dans la préparation des sélections pilotes et des
            évaluations techniques.
          </p>
        </div>

      </div>

      <div className="mt-12">
        <a
          href="/login"
          className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold"
        >
          Accéder à la formation
        </a>
      </div>

      <div className="bg-slate-50 p-8 rounded-2xl mt-16">
        <h2 className="text-2xl font-bold mb-4">
    Aller plus loin
  </h2>

  <ul className="space-y-3">

    <li>
      <a href="/preparation-ir-easa" className="text-blue-600 font-semibold">
        Préparation IR EASA
      </a>
    </li>

    <li>
      <a href="/renouvellement-ir" className="text-blue-600 font-semibold">
        Renouvellement IR
      </a>
    </li>

    <li>
      <a href="/faq-ifr" className="text-blue-600 font-semibold">
        FAQ IFR
      </a>
    </li>

  </ul>
</div>

    </div>
  );
}
